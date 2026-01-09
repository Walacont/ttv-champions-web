import {
    collection,
    doc,
    onSnapshot,
    query,
    orderBy,
    runTransaction,
    serverTimestamp,
    increment,
    getDoc,
    getDocs,
    where,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { getCurrentSeasonKey } from './ui-utils.js';




export function loadPointsHistory(userData, db, unsubscribes) {
    const pointsHistoryEl = document.getElementById('points-history');
    if (!pointsHistoryEl) return;

    const q = query(
        collection(db, `users/${userData.id}/pointsHistory`),
        orderBy('timestamp', 'desc')
    );
    const historyListener = onSnapshot(q, snapshot => {
        pointsHistoryEl.innerHTML = snapshot.empty
            ? `<li><p class="text-gray-400">Noch keine Punkte erhalten.</p></li>`
            : '';
        snapshot.forEach(doc => {
            const entry = doc.data();
            const pointsClass = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-gray-600';
            const sign = entry.points > 0 ? '+' : entry.points < 0 ? '' : '±';
            const date = entry.timestamp
                ? entry.timestamp.toDate().toLocaleDateString('de-DE')
                : '...';

            const xpChange = entry.xp !== undefined ? entry.xp : entry.points;
            const eloChange = entry.eloChange !== undefined ? entry.eloChange : 0;

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
            if (entry.isActivePlayer) {
                partnerBadge =
                    '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.isPartner) {
                partnerBadge =
                    '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">🤝 Partner</span>';
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
    });
    unsubscribes.push(historyListener);
}


export function loadPointsHistoryForCoach(playerId, db, setUnsubscribe) {
    const historyListEl = document.getElementById('coach-points-history-list');
    if (!historyListEl) return;

    if (!playerId) {
        historyListEl.innerHTML =
            '<li class="text-center text-gray-500 py-4">Bitte einen Spieler auswählen, um die Historie anzuzeigen.</li>';
        return;
    }

    historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Lade Historie...</li>';
    const q = query(
        collection(db, `users/${playerId}/pointsHistory`),
        orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            historyListEl.innerHTML = `<li><p class="text-center text-gray-400 py-4">Für diesen Spieler gibt es noch keine Einträge.</p></li>`;
            return;
        }

        historyListEl.innerHTML = '';
        snapshot.forEach(doc => {
            const entry = doc.data();
            const pointsClass = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-gray-600';
            const sign = entry.points > 0 ? '+' : entry.points < 0 ? '' : '±';
            const date = entry.timestamp
                ? entry.timestamp.toDate().toLocaleDateString('de-DE')
                : '...';

            const xpChange = entry.xp !== undefined ? entry.xp : entry.points;
            const eloChange = entry.eloChange !== undefined ? entry.eloChange : 0;

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
            if (entry.isActivePlayer) {
                partnerBadge =
                    '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.isPartner) {
                partnerBadge =
                    '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">🤝 Partner</span>';
            }

            const li = document.createElement('li');
            li.className = 'flex justify-between items-start text-sm bg-gray-50 p-2 rounded-md';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}${partnerBadge}</p>
                    <p class="text-xs text-gray-500">${date} - ${entry.awardedBy || 'Unbekannt'}</p>
                </div>
                <div class="text-right">${detailsHTML}</div>
            `;
            historyListEl.appendChild(li);
        });
    });

    setUnsubscribe(unsubscribe);
}


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


export async function handlePointsFormSubmit(e, db, currentUserData, handleReasonChangeCallback) {
    e.preventDefault();
    const feedbackEl = document.getElementById('points-feedback');
    const playerId = document.getElementById('player-select').value;
    const reasonType = document.getElementById('reason-select').value;
    feedbackEl.textContent = '';

    if (!playerId || !reasonType) {
        feedbackEl.textContent = 'Bitte Spieler und Grund auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    let points = 0;
    let xpChange = 0;
    let reason = '';
    let challengeId = null;
    let exerciseId = null;
    let challengeSubgroupId = null;

    try {
        switch (reasonType) {
            case 'penalty':
                const severity = document.getElementById('penalty-severity').value;
                const penaltyReason = document.getElementById('penalty-reason').value;
                if (!penaltyReason) throw new Error('Bitte einen Grund für die Strafe angeben.');

                const penalties = {
                    light: { points: -10, xp: -5 },
                    medium: { points: -20, xp: -10 },
                    severe: { points: -30, xp: -20 },
                };

                const penalty = penalties[severity];
                points = penalty.points;
                xpChange = penalty.xp;
                reason = `🚫 Strafe: ${penaltyReason}`;
                break;
            case 'challenge':
                const cSelect = document.getElementById('challenge-select');
                const cOption = cSelect.options[cSelect.selectedIndex];
                if (!cOption || !cOption.value) throw new Error('Bitte eine Challenge auswählen.');

                const challengeHasMilestones = cOption.dataset.hasMilestones === 'true';
                if (challengeHasMilestones) {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone =
                        milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (
                        !selectedMilestone ||
                        selectedMilestone.value === '' ||
                        !selectedMilestone.dataset.count
                    ) {
                        throw new Error('Bitte einen Meilenstein auswählen.');
                    }

                    points = parseInt(selectedMilestone.dataset.cumulativePoints);
                    xpChange = points;
                    const milestoneCount = parseInt(selectedMilestone.dataset.count);
                    reason = `Challenge: ${cOption.dataset.title} (${milestoneCount}× Meilenstein)`;
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
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone =
                        milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (
                        !selectedMilestone ||
                        selectedMilestone.value === '' ||
                        !selectedMilestone.dataset.count
                    ) {
                        throw new Error('Bitte einen Meilenstein auswählen.');
                    }

                    points = parseInt(selectedMilestone.dataset.cumulativePoints);
                    xpChange = points;
                    const milestoneCount = parseInt(selectedMilestone.dataset.count);
                    reason = `Übung: ${eOption.dataset.title} (${milestoneCount}× Meilenstein)`;
                } else {
                    points = parseInt(eOption.dataset.points);
                    xpChange = points;
                    reason = `Übung: ${eOption.dataset.title}`;
                }

                exerciseId = eOption.value;
                break;
            case 'manual':
                points = parseInt(document.getElementById('manual-points').value);
                const manualXpInput = document.getElementById('manual-xp').value;
                xpChange = manualXpInput ? parseInt(manualXpInput) : points;
                reason = document.getElementById('manual-reason').value;
                if (!reason || isNaN(points))
                    throw new Error('Grund und gültige Punkte müssen angegeben werden.');
                if (manualXpInput && isNaN(xpChange))
                    throw new Error('XP muss eine gültige Zahl sein.');
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
                partnerPercentage =
                    parseInt(document.getElementById('manual-partner-percentage')?.value) || 50;
                partnerId = document.getElementById('manual-partner-select')?.value;

                if (partnerId && partnerId === playerId) {
                    throw new Error('Der Partner kann nicht der gleiche Spieler sein.');
                }
            }
        }

        if (challengeId) {
            const playerDocRef = doc(db, 'users', playerId);
            const playerSnap = await getDoc(playerDocRef);

            if (!playerSnap.exists()) {
                throw new Error('Spieler nicht gefunden.');
            }

            const playerData = playerSnap.data();

            if (challengeSubgroupId && challengeSubgroupId !== 'all') {
                const playerSubgroups = playerData.subgroupIDs || [];

                if (!playerSubgroups.includes(challengeSubgroupId)) {
                    const subgroupDocRef = doc(db, 'subgroups', challengeSubgroupId);
                    const subgroupSnap = await getDoc(subgroupDocRef);

                    let subgroupName = 'dieser Untergruppe';
                    if (subgroupSnap.exists()) {
                        subgroupName = subgroupSnap.data().name || 'dieser Untergruppe';
                    }

                    const playerName = `${playerData.firstName} ${playerData.lastName}`;
                    throw new Error(
                        `${playerName} gehört nicht der Untergruppe an, für die diese Challenge erstellt wurde. ` +
                            `Bitte füge die Person in die Untergruppe "${subgroupName}" ein, um ihr diese Challenge zuzuweisen.`
                    );
                }
            }

            const challengeDocRef = doc(db, 'challenges', challengeId);
            const challengeSnap = await getDoc(challengeDocRef);

            if (challengeSnap.exists()) {
                const challengeData = challengeSnap.data();
                const isRepeatable =
                    challengeData.isRepeatable !== undefined ? challengeData.isRepeatable : true;
                const lastReactivatedAt =
                    challengeData.lastReactivatedAt || challengeData.createdAt;

                if (!isRepeatable) {
                    const completedChallengeRef = doc(
                        db,
                        `users/${playerId}/completedChallenges`,
                        challengeId
                    );
                    const completedChallengeSnap = await getDoc(completedChallengeRef);

                    if (completedChallengeSnap.exists()) {
                        const completedData = completedChallengeSnap.data();
                        const completedAt = completedData.completedAt;

                        if (
                            completedAt &&
                            lastReactivatedAt &&
                            completedAt.toMillis() > lastReactivatedAt.toMillis()
                        ) {
                            const playerName = `${playerData.firstName} ${playerData.lastName}`;
                            throw new Error(
                                `${playerName} hat diese Challenge bereits abgeschlossen. ` +
                                    `Diese Challenge ist nur einmalig einlösbar und kann erst wieder zugewiesen werden, wenn sie abgelaufen und reaktiviert wurde.`
                            );
                        }
                    }
                }
            }
        }

        let grundlagenMessage = '';
        let actualPointsChange = 0;
        let actualXPChange = 0;
        let actualPartnerPointsChange = 0;
        let actualPartnerXPChange = 0;
        let partnerName = '';

        await runTransaction(db, async transaction => {
            const playerDocRef = doc(db, 'users', playerId);
            const playerDoc = await transaction.get(playerDocRef);
            if (!playerDoc.exists()) throw new Error('Spieler nicht gefunden.');

            const playerData = playerDoc.data();
            let grundlagenCount = playerData.grundlagenCompleted || 0;
            let isGrundlagenExercise = false;

            if (exerciseId) {
                const exerciseRef = doc(db, 'exercises', exerciseId);
                const exerciseDoc = await transaction.get(exerciseRef);
                if (exerciseDoc.exists()) {
                    const exerciseData = exerciseDoc.data();
                    const tags = exerciseData.tags || [];
                    isGrundlagenExercise = tags.includes('Grundlage');
                }
            }
            else if (reasonType === 'manual') {
                const lowerReason = reason.toLowerCase();
                isGrundlagenExercise =
                    lowerReason.includes('grundlage') || lowerReason.includes('grundlagen');
            }

            let partnerDoc = null;
            let partnerDocRef = null;
            let partnerData = null;
            if (hasPartnerSystem && partnerId) {
                partnerDocRef = doc(db, 'users', partnerId);
                partnerDoc = await transaction.get(partnerDocRef);
                if (partnerDoc.exists()) {
                    partnerData = partnerDoc.data();
                }
            }

            let exerciseMilestoneDoc = null;
            let challengeMilestoneDoc = null;
            const currentSeasonKey = await getCurrentSeasonKey(db);

            if (exerciseId && reasonType === 'exercise') {
                const eOption =
                    document.getElementById('exercise-select').options[
                        document.getElementById('exercise-select').selectedIndex
                    ];
                if (eOption?.dataset.hasMilestones === 'true') {
                    const progressRef = doc(db, `users/${playerId}/exerciseMilestones`, exerciseId);
                    exerciseMilestoneDoc = await transaction.get(progressRef);
                }
            }

            if (challengeId && reasonType === 'challenge') {
                const cOption =
                    document.getElementById('challenge-select').options[
                        document.getElementById('challenge-select').selectedIndex
                    ];
                if (cOption?.dataset.hasMilestones === 'true') {
                    const progressRef = doc(
                        db,
                        `users/${playerId}/challengeMilestones`,
                        challengeId
                    );
                    challengeMilestoneDoc = await transaction.get(progressRef);
                }
            }


            if (exerciseMilestoneDoc && reasonType === 'exercise') {
                const milestoneSelect = document.getElementById('milestone-select');
                const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                if (selectedMilestone && selectedMilestone.value) {
                    const newMilestoneCount = parseInt(selectedMilestone.dataset.count);

                    if (exerciseMilestoneDoc.exists()) {
                        const progressData = exerciseMilestoneDoc.data();
                        const lastSeasonKey = progressData.lastSeasonUpdated || '';

                        if (lastSeasonKey === currentSeasonKey) {
                            const currentCount = progressData.currentCount || 0;
                            if (newMilestoneCount <= currentCount) {
                                throw new Error(
                                    `Du kannst nur höhere Meilensteine vergeben! Aktueller Fortschritt: ${currentCount}×, gewählt: ${newMilestoneCount}×`
                                );
                            }
                        }
                    }
                }
            }

            if (challengeMilestoneDoc && reasonType === 'challenge') {
                const milestoneSelect = document.getElementById('milestone-select');
                const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                if (selectedMilestone && selectedMilestone.value) {
                    const newMilestoneCount = parseInt(selectedMilestone.dataset.count);

                    if (challengeMilestoneDoc.exists()) {
                        const progressData = challengeMilestoneDoc.data();
                        const lastSeasonKey = progressData.lastSeasonUpdated || '';

                        if (lastSeasonKey === currentSeasonKey) {
                            const currentCount = progressData.currentCount || 0;
                            if (newMilestoneCount <= currentCount) {
                                throw new Error(
                                    `Du kannst nur höhere Meilensteine vergeben! Aktueller Fortschritt: ${currentCount}×, gewählt: ${newMilestoneCount}×`
                                );
                            }
                        }
                    }
                }
            }

            const currentPoints = playerData.points || 0;
            const currentXP = playerData.xp || 0;

            actualPointsChange = Math.max(-currentPoints, points);
            actualXPChange = Math.max(-currentXP, xpChange);

            if (partnerData) {
                const partnerPoints = Math.round(actualPointsChange * (partnerPercentage / 100));
                const partnerXP = Math.round(actualXPChange * (partnerPercentage / 100));

                const currentPartnerPoints = partnerData.points || 0;
                const currentPartnerXP = partnerData.xp || 0;

                actualPartnerPointsChange = Math.max(-currentPartnerPoints, partnerPoints);
                actualPartnerXPChange = Math.max(-currentPartnerXP, partnerXP);
                partnerName = `${partnerData.firstName} ${partnerData.lastName}`;
            }

            const updateData = {
                points: increment(actualPointsChange),
                xp: increment(actualXPChange),
                lastXPUpdate: serverTimestamp(),
            };

            if (isGrundlagenExercise && grundlagenCount < 5) {
                grundlagenCount++;
                updateData.grundlagenCompleted = grundlagenCount;

                const remaining = 5 - grundlagenCount;
                if (grundlagenCount >= 5) {
                    updateData.isMatchReady = true;
                    grundlagenMessage = ' 🎉 Grundlagen abgeschlossen - Wettkämpfe freigeschaltet!';
                } else {
                    grundlagenMessage = ` (${grundlagenCount}/5 Grundlagen - noch ${remaining} bis Wettkämpfe)`;
                }
            }

            transaction.update(playerDocRef, updateData);

            if (!hasPartnerSystem || !partnerId) {
                const historyColRef = collection(db, `users/${playerId}/pointsHistory`);
                transaction.set(doc(historyColRef), {
                    points: actualPointsChange,
                    xp: actualXPChange,
                    eloChange: 0,
                    reason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                });

                if (actualXPChange !== 0) {
                    const xpHistoryColRef = collection(db, `users/${playerId}/xpHistory`);
                    transaction.set(doc(xpHistoryColRef), {
                        xp: actualXPChange,
                        reason,
                        timestamp: serverTimestamp(),
                        awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    });
                }
            }

            if (exerciseId) {
                const completedExerciseRef = doc(
                    db,
                    `users/${playerId}/completedExercises`,
                    exerciseId
                );
                transaction.set(completedExerciseRef, {
                    completedAt: serverTimestamp(),
                    seasonKey: currentSeasonKey,
                });
            }

            if (challengeId) {
                const completedChallengeRef = doc(
                    db,
                    `users/${playerId}/completedChallenges`,
                    challengeId
                );
                transaction.set(completedChallengeRef, {
                    completedAt: serverTimestamp(),
                    seasonKey: currentSeasonKey,
                });
            }

            if (exerciseId && reasonType === 'exercise') {
                const eOption =
                    document.getElementById('exercise-select').options[
                        document.getElementById('exercise-select').selectedIndex
                    ];
                if (eOption?.dataset.hasMilestones === 'true') {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone =
                        milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (selectedMilestone && selectedMilestone.value) {
                        const milestoneCount = parseInt(selectedMilestone.dataset.count);
                        const progressRef = doc(
                            db,
                            `users/${playerId}/exerciseMilestones`,
                            exerciseId
                        );

                        transaction.set(
                            progressRef,
                            {
                                currentCount: milestoneCount,
                                lastUpdated: serverTimestamp(),
                                lastSeasonUpdated: currentSeasonKey,
                            },
                            { merge: true }
                        );
                    }
                }
            }

            if (challengeId && reasonType === 'challenge') {
                const cOption =
                    document.getElementById('challenge-select').options[
                        document.getElementById('challenge-select').selectedIndex
                    ];
                if (cOption?.dataset.hasMilestones === 'true') {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone =
                        milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (selectedMilestone && selectedMilestone.value) {
                        const milestoneCount = parseInt(selectedMilestone.dataset.count);
                        const progressRef = doc(
                            db,
                            `users/${playerId}/challengeMilestones`,
                            challengeId
                        );

                        transaction.set(
                            progressRef,
                            {
                                currentCount: milestoneCount,
                                lastUpdated: serverTimestamp(),
                                lastSeasonUpdated: currentSeasonKey,
                            },
                            { merge: true }
                        );
                    }
                }
            }

            if (partnerData && partnerDocRef) {
                transaction.update(partnerDocRef, {
                    points: increment(actualPartnerPointsChange),
                    xp: increment(actualPartnerXPChange),
                    lastXPUpdate: serverTimestamp(),
                });

                const activePlayerName = `${playerData.firstName} ${playerData.lastName}`;
                const partnerReason = `🤝 Partner: ${reason} (mit ${activePlayerName})`;

                const partnerHistoryColRef = collection(db, `users/${partnerId}/pointsHistory`);
                transaction.set(doc(partnerHistoryColRef), {
                    points: actualPartnerPointsChange,
                    xp: actualPartnerXPChange,
                    eloChange: 0,
                    reason: partnerReason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    isPartner: true,
                    partnerId: playerId,
                });

                if (actualPartnerXPChange !== 0) {
                    const partnerXpHistoryColRef = collection(db, `users/${partnerId}/xpHistory`);
                    transaction.set(doc(partnerXpHistoryColRef), {
                        xp: actualPartnerXPChange,
                        reason: partnerReason,
                        timestamp: serverTimestamp(),
                        awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                        isPartner: true,
                        partnerId: playerId,
                    });
                }

                const playerHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
                const activeReason = `💪 ${reason} (Partner: ${partnerName})`;

                transaction.set(playerHistoryRef, {
                    points: actualPointsChange,
                    xp: actualXPChange,
                    eloChange: 0,
                    reason: activeReason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    isActivePlayer: true,
                    partnerId: partnerId,
                });
            }
        });

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
        feedbackEl.className =
            actualPointsChange >= 0
                ? 'mt-3 text-sm font-medium text-center text-green-600'
                : 'mt-3 text-sm font-medium text-center text-orange-600';
        e.target.reset();

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


export function handleReasonChange() {
    const value = document.getElementById('reason-select').value;
    const challengeContainer = document.getElementById('challenge-select-container');
    const exerciseContainer = document.getElementById('exercise-select-container');
    const penaltyContainer = document.getElementById('penalty-container');
    const manualContainer = document.getElementById('manual-points-container');
    const milestoneContainer = document.getElementById('milestone-select-container');

    const challengeSelect = document.getElementById('challenge-select');
    const exerciseSelect = document.getElementById('exercise-select');
    const penaltyReason = document.getElementById('penalty-reason');

    if (challengeContainer) challengeContainer.classList.toggle('hidden', value !== 'challenge');
    if (exerciseContainer) exerciseContainer.classList.toggle('hidden', value !== 'exercise');
    if (penaltyContainer) penaltyContainer.classList.toggle('hidden', value !== 'penalty');
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

    if (penaltyReason) {
        if (value === 'penalty') {
            penaltyReason.setAttribute('required', 'required');
        } else {
            penaltyReason.removeAttribute('required');
        }
    }
}


export function setupMilestoneSelectors(db) {
    console.log('🎯 Setup milestone selectors called');
    const exerciseSelect = document.getElementById('exercise-select');
    const challengeSelect = document.getElementById('challenge-select');
    const playerSelect = document.getElementById('player-select');
    const partnerSelect = document.getElementById('partner-select');

    console.log('Selectors found:', {
        exerciseSelect: !!exerciseSelect,
        challengeSelect: !!challengeSelect,
        playerSelect: !!playerSelect,
        partnerSelect: !!partnerSelect,
    });

    if (exerciseSelect) {
        exerciseSelect.addEventListener('change', () => {
            console.log('Exercise select changed!');
            handleExerciseChallengeChange(db, 'exercise');
        });
    }

    if (challengeSelect) {
        challengeSelect.addEventListener('change', () => {
            console.log('Challenge select changed!');
            handleExerciseChallengeChange(db, 'challenge');
        });
    }

    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            const reasonType = document.getElementById('reason-select').value;
            console.log('Player changed, reason type:', reasonType);

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


async function handleExerciseChallengeChange(db, type) {
    console.log(`🔄 handleExerciseChallengeChange called for type: ${type}`);

    const select = document.getElementById(`${type}-select`);
    const milestoneContainer = document.getElementById('milestone-select-container');
    const milestoneSelect = document.getElementById('milestone-select');
    const playerSelect = document.getElementById('player-select');

    console.log('Elements found:', {
        select: !!select,
        milestoneContainer: !!milestoneContainer,
        milestoneSelect: !!milestoneSelect,
        playerSelect: !!playerSelect,
    });

    if (!select || !milestoneContainer || !milestoneSelect) {
        console.log('❌ Missing elements, returning');
        return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const hasMilestones = selectedOption?.dataset.hasMilestones === 'true';

    console.log('Selected option:', {
        value: selectedOption?.value,
        hasMilestones,
        milestonesData: selectedOption?.dataset.milestones,
    });

    if (!hasMilestones || !selectedOption.value) {
        console.log('❌ No milestones or no value, hiding milestone container');
        milestoneContainer.classList.add('hidden');

        if (selectedOption.value) {
            await showCompletionStatus(db, type, selectedOption.value, playerSelect?.value);
        } else {
            hideCompletionStatus();
        }
    } else {
        console.log('✅ Has milestones, showing container');
        hideCompletionStatus();

        milestoneContainer.classList.remove('hidden');

        const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
        const itemId = selectedOption.value;

        console.log('Milestones:', milestones);

        const playerId = playerSelect?.value;

        let playerProgress = { currentCount: 0 };
        if (playerId) {
            const collectionName =
                type === 'exercise' ? 'exerciseMilestones' : 'challengeMilestones';
            playerProgress = await getMilestoneProgress(db, playerId, collectionName, itemId);
            console.log('Player progress:', playerProgress);
        } else {
            console.log('⚠️ No player selected yet, showing milestones without progress');
        }

        milestoneSelect.innerHTML = '<option value="">Meilenstein wählen...</option>';

        const currentSeasonKey = await getCurrentSeasonKey(db);
        const progressSeasonKey = playerProgress.lastSeasonUpdated || '';
        const isCurrentSeason = progressSeasonKey === currentSeasonKey;
        const currentCount = isCurrentSeason ? playerProgress.currentCount || 0 : 0;

        milestones.forEach((milestone, index) => {
            const option = document.createElement('option');
            option.value = index;
            const isCompleted = playerId && currentCount >= milestone.count;
            const status = isCompleted ? '✅' : '';
            option.textContent = `${milestone.count}× erreicht → ${milestone.points} P. ${status}`;
            option.dataset.count = milestone.count;
            option.dataset.points = milestone.points;
            option.dataset.isCompleted = isCompleted;

            let cumulativePoints = 0;
            for (let i = 0; i <= index; i++) {
                cumulativePoints += milestones[i].points;
            }
            option.dataset.cumulativePoints = cumulativePoints;

            milestoneSelect.appendChild(option);
        });

        await updateMilestoneProgressDisplay(playerProgress, milestones, db);
    }

    const partnerContainer = document.getElementById('partner-select-container');
    if (!partnerContainer) return;

    const hasPartnerSystem = selectedOption?.dataset.hasPartnerSystem === 'true';
    const partnerPercentage = parseInt(selectedOption?.dataset.partnerPercentage) || 50;

    if (!hasPartnerSystem || !selectedOption.value) {
        console.log('❌ No partner system, hiding partner container');
        partnerContainer.classList.add('hidden');
        return;
    }

    console.log('✅ Has partner system, showing container');
    partnerContainer.classList.remove('hidden');

    const percentageDisplay = document.getElementById('partner-percentage');
    if (percentageDisplay) {
        percentageDisplay.textContent = partnerPercentage;
    }

    const playerId = playerSelect?.value;
    const activePlayerName = document.getElementById('active-player-name');
    if (activePlayerName) {
        const activePlayerText = playerId
            ? playerSelect.options[playerSelect.selectedIndex].text
            : '-';
        activePlayerName.textContent = activePlayerText;
    }

    await populatePartnerDropdown(db, playerId);
}


async function getMilestoneProgress(db, playerId, collectionName, itemId) {
    try {
        const progressDocRef = doc(db, `users/${playerId}/${collectionName}`, itemId);
        const progressSnap = await getDoc(progressDocRef);

        if (progressSnap.exists()) {
            const data = progressSnap.data();
            return {
                currentCount: data.currentCount || 0,
                completedMilestones: data.completedMilestones || [],
            };
        }
    } catch (error) {
        console.error('Error loading milestone progress:', error);
    }

    return { currentCount: 0, completedMilestones: [] };
}


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

    const milestoneSelect = document.getElementById('milestone-select');
    if (milestoneSelect) {
        milestoneSelect.addEventListener('change', () => {
            const selected = milestoneSelect.options[milestoneSelect.selectedIndex];
            const pointsText = document.getElementById('milestone-points-text');

            if (pointsText && selected && selected.value) {
                const cumulativePoints = selected.dataset.cumulativePoints;
                pointsText.textContent = `${cumulativePoints} P. (kumulativ)`;
            }
        });
    }
}


async function populatePartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('partner-select');
    if (!partnerSelect) return;

    partnerSelect.innerHTML =
        '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) {
        console.log('⚠️ No active player selected, partner dropdown empty');
        return;
    }

    try {
        const activePlayerDoc = await getDoc(doc(db, 'users', activePlayerId));
        if (!activePlayerDoc.exists()) {
            console.error('Active player document not found');
            return;
        }

        const clubId = activePlayerDoc.data().clubId;

        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player')
        );

        const playersSnapshot = await getDocs(playersQuery);

        playersSnapshot.forEach(doc => {
            if (doc.id === activePlayerId) return;

            const player = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${player.firstName} ${player.lastName}`;
            partnerSelect.appendChild(option);
        });

        console.log(`✅ Partner dropdown populated with ${playersSnapshot.size - 1} players`);
    } catch (error) {
        console.error('Error populating partner dropdown:', error);
    }
}


async function populateManualPartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('manual-partner-select');
    if (!partnerSelect) return;

    partnerSelect.innerHTML =
        '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) {
        console.log('⚠️ No active player selected, manual partner dropdown empty');
        return;
    }

    try {
        const activePlayerDoc = await getDoc(doc(db, 'users', activePlayerId));
        if (!activePlayerDoc.exists()) {
            console.error('Active player document not found');
            return;
        }

        const clubId = activePlayerDoc.data().clubId;

        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player')
        );

        const playersSnapshot = await getDocs(playersQuery);

        playersSnapshot.forEach(doc => {
            if (doc.id === activePlayerId) return;

            const player = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${player.firstName} ${player.lastName}`;
            partnerSelect.appendChild(option);
        });

        console.log(
            `✅ Manual partner dropdown populated with ${playersSnapshot.size - 1} players`
        );
    } catch (error) {
        console.error('Error populating manual partner dropdown:', error);
    }
}


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


async function showCompletionStatus(db, type, itemId, playerId) {
    const container = document.getElementById('completion-status-container');
    const statusText = document.getElementById('completion-status-text');

    if (!container || !statusText) return;

    if (!playerId) {
        container.classList.add('hidden');
        return;
    }

    try {
        const collectionName = type === 'exercise' ? 'completedExercises' : 'completedChallenges';
        const completionRef = doc(db, `users/${playerId}/${collectionName}`, itemId);
        const completionDoc = await getDoc(completionRef);

        const currentSeasonKey = await getCurrentSeasonKey(db);

        if (completionDoc.exists()) {
            const data = completionDoc.data();
            const completedSeasonKey = data.seasonKey || '';
            const isCurrentSeason = completedSeasonKey === currentSeasonKey;

            if (isCurrentSeason) {
                const completedDate =
                    data.completedAt?.toDate().toLocaleDateString('de-DE') || '(unbekannt)';
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


function hideCompletionStatus() {
    const container = document.getElementById('completion-status-container');
    if (container) {
        container.classList.add('hidden');
    }
}
