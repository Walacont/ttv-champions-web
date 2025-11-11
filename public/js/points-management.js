import { collection, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, increment, getDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Points Management Module
 * Handles points awarding, points history display for both players and coaches
 */

/**
 * Loads points history for a player (dashboard view)
 * @param {Object} userData - User data with id
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadPointsHistory(userData, db, unsubscribes) {
    const pointsHistoryEl = document.getElementById('points-history');
    if (!pointsHistoryEl) return;

    const q = query(collection(db, `users/${userData.id}/pointsHistory`), orderBy("timestamp", "desc"));
    const historyListener = onSnapshot(q, (snapshot) => {
        pointsHistoryEl.innerHTML = snapshot.empty ? `<li><p class="text-gray-400">Noch keine Punkte erhalten.</p></li>` : '';
        snapshot.forEach(doc => {
            const entry = doc.data();
            const pointsClass = entry.points >= 0 ? 'text-green-600' : 'text-red-600';
            const sign = entry.points >= 0 ? '+' : '';
            const date = entry.timestamp ? entry.timestamp.toDate().toLocaleDateString('de-DE') : '...';

            // Build detailed points breakdown
            const xpChange = entry.xp !== undefined ? entry.xp : entry.points; // Fallback to points if xp not set
            const eloChange = entry.eloChange !== undefined ? entry.eloChange : 0;

            let detailsHTML = `<span class="font-bold ${pointsClass}">${sign}${entry.points} Pkt</span>`;

            // Add XP and Elo details if they exist
            const details = [];
            if (xpChange !== 0) {
                const xpSign = xpChange >= 0 ? '+' : '';
                details.push(`${xpSign}${xpChange} XP`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange >= 0 ? '+' : '';
                const eloClass = eloChange >= 0 ? 'text-blue-600' : 'text-red-600';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} Elo</span>`);
            }

            if (details.length > 0) {
                detailsHTML += `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`;
            }

            // Add partner badge if applicable
            let partnerBadge = '';
            if (entry.isActivePlayer) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.isPartner) {
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
    });
    unsubscribes.push(historyListener);
}

/**
 * Loads points history for a specific player (coach view)
 * @param {string} playerId - Player ID
 * @param {Object} db - Firestore database instance
 * @param {Function} setUnsubscribe - Callback to set unsubscribe function
 */
export function loadPointsHistoryForCoach(playerId, db, setUnsubscribe) {
    const historyListEl = document.getElementById('coach-points-history-list');
    if (!historyListEl) return;

    if (!playerId) {
        historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Bitte einen Spieler auswählen, um die Historie anzuzeigen.</li>';
        return;
    }

    historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Lade Historie...</li>';
    const q = query(collection(db, `users/${playerId}/pointsHistory`), orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historyListEl.innerHTML = `<li><p class="text-center text-gray-400 py-4">Für diesen Spieler gibt es noch keine Einträge.</p></li>`;
            return;
        }

        historyListEl.innerHTML = '';
        snapshot.forEach(doc => {
            const entry = doc.data();
            const pointsClass = entry.points >= 0 ? 'text-green-600' : 'text-red-600';
            const sign = entry.points >= 0 ? '+' : '';
            const date = entry.timestamp ? entry.timestamp.toDate().toLocaleDateString('de-DE') : '...';

            // Build detailed points breakdown
            const xpChange = entry.xp !== undefined ? entry.xp : entry.points; // Fallback to points if xp not set
            const eloChange = entry.eloChange !== undefined ? entry.eloChange : 0;

            let detailsHTML = `<span class="font-bold ${pointsClass}">${sign}${entry.points} Pkt</span>`;

            // Add XP and Elo details if they exist
            const details = [];
            if (xpChange !== 0) {
                const xpSign = xpChange >= 0 ? '+' : '';
                details.push(`${xpSign}${xpChange} XP`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange >= 0 ? '+' : '';
                const eloClass = eloChange >= 0 ? 'text-blue-600' : 'text-red-600';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} Elo</span>`);
            }

            if (details.length > 0) {
                detailsHTML += `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`;
            }

            // Add partner badge if applicable
            let partnerBadge = '';
            if (entry.isActivePlayer) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.isPartner) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">🤝 Partner</span>';
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

/**
 * Populates the player filter dropdown for points history
 * @param {Array} clubPlayers - Array of club players
 */
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

/**
 * Handles points form submission (coach awarding points)
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 * @param {Function} handleReasonChangeCallback - Callback to reset reason UI
 */
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
    let xpChange = 0; // Separate XP change (for penalties)
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

                // Define penalty amounts according to new system
                const penalties = {
                    light: { points: -10, xp: -5 },
                    medium: { points: -20, xp: -10 },
                    severe: { points: -30, xp: -20 }
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

                // Check if challenge has milestones
                const challengeHasMilestones = cOption.dataset.hasMilestones === 'true';
                if (challengeHasMilestones) {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (!selectedMilestone || selectedMilestone.value === '' || !selectedMilestone.dataset.count) {
                        throw new Error('Bitte einen Meilenstein auswählen.');
                    }

                    // Get cumulative points
                    points = parseInt(selectedMilestone.dataset.cumulativePoints);
                    xpChange = points;
                    const milestoneCount = parseInt(selectedMilestone.dataset.count);
                    reason = `Challenge: ${cOption.dataset.title} (${milestoneCount}× Meilenstein)`;
                } else {
                    points = parseInt(cOption.dataset.points);
                    xpChange = points; // XP = points for challenges
                    reason = `Challenge: ${cOption.dataset.title}`;
                }

                challengeId = cOption.value;
                challengeSubgroupId = cOption.dataset.subgroupId || 'all';
                break;
            case 'exercise':
                const eSelect = document.getElementById('exercise-select');
                const eOption = eSelect.options[eSelect.selectedIndex];
                if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.');

                // Check if exercise has milestones
                const exerciseHasMilestones = eOption.dataset.hasMilestones === 'true';
                if (exerciseHasMilestones) {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (!selectedMilestone || selectedMilestone.value === '' || !selectedMilestone.dataset.count) {
                        throw new Error('Bitte einen Meilenstein auswählen.');
                    }

                    // Get cumulative points
                    points = parseInt(selectedMilestone.dataset.cumulativePoints);
                    xpChange = points;
                    const milestoneCount = parseInt(selectedMilestone.dataset.count);
                    reason = `Übung: ${eOption.dataset.title} (${milestoneCount}× Meilenstein)`;
                } else {
                    points = parseInt(eOption.dataset.points);
                    xpChange = points; // XP = points for exercises
                    reason = `Übung: ${eOption.dataset.title}`;
                }

                exerciseId = eOption.value;
                break;
            case 'manual':
                points = parseInt(document.getElementById('manual-points').value);
                const manualXpInput = document.getElementById('manual-xp').value;
                xpChange = manualXpInput ? parseInt(manualXpInput) : points; // Use manual XP if provided, else same as points
                reason = document.getElementById('manual-reason').value;
                if (!reason || isNaN(points)) throw new Error('Grund und gültige Punkte müssen angegeben werden.');
                if (manualXpInput && isNaN(xpChange)) throw new Error('XP muss eine gültige Zahl sein.');
                break;
        }

        // Check for partner system
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

                // Validate partner selection (only if a partner is selected)
                if (partnerId && partnerId === playerId) {
                    throw new Error('Der Partner kann nicht der gleiche Spieler sein.');
                }
            }
        } else if (reasonType === 'manual') {
            // Check manual partner toggle
            const manualToggle = document.getElementById('manual-partner-toggle');
            hasPartnerSystem = manualToggle?.checked || false;

            if (hasPartnerSystem) {
                partnerPercentage = parseInt(document.getElementById('manual-partner-percentage')?.value) || 50;
                partnerId = document.getElementById('manual-partner-select')?.value;

                // Validate partner selection (only if a partner is selected)
                if (partnerId && partnerId === playerId) {
                    throw new Error('Der Partner kann nicht der gleiche Spieler sein.');
                }
            }
        }

        // Validate challenge subgroup membership and repeatable status
        if (challengeId) {
            const playerDocRef = doc(db, 'users', playerId);
            const playerSnap = await getDoc(playerDocRef);

            if (!playerSnap.exists()) {
                throw new Error('Spieler nicht gefunden.');
            }

            const playerData = playerSnap.data();

            // Subgroup validation
            if (challengeSubgroupId && challengeSubgroupId !== 'all') {
                const playerSubgroups = playerData.subgroupIDs || [];

                // Check if player is in the challenge's subgroup
                if (!playerSubgroups.includes(challengeSubgroupId)) {
                    // Load subgroup name for helpful error message
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

            // Check if challenge is repeatable
            const challengeDocRef = doc(db, 'challenges', challengeId);
            const challengeSnap = await getDoc(challengeDocRef);

            if (challengeSnap.exists()) {
                const challengeData = challengeSnap.data();
                const isRepeatable = challengeData.isRepeatable !== undefined ? challengeData.isRepeatable : true; // Default to true for backwards compatibility
                const lastReactivatedAt = challengeData.lastReactivatedAt || challengeData.createdAt;

                // If challenge is NOT repeatable, check if player already completed it
                if (!isRepeatable) {
                    const completedChallengeRef = doc(db, `users/${playerId}/completedChallenges`, challengeId);
                    const completedChallengeSnap = await getDoc(completedChallengeRef);

                    if (completedChallengeSnap.exists()) {
                        const completedData = completedChallengeSnap.data();
                        const completedAt = completedData.completedAt;

                        // Check if completion was after last reactivation
                        if (completedAt && lastReactivatedAt && completedAt.toMillis() > lastReactivatedAt.toMillis()) {
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
        let actualPointsChange = 0; // Declare outside transaction
        let actualXPChange = 0; // Declare outside transaction
        let actualPartnerPointsChange = 0; // For partner feedback
        let actualPartnerXPChange = 0; // For partner feedback
        let partnerName = ''; // For feedback

        await runTransaction(db, async (transaction) => {
            // ===== PHASE 1: ALL READS FIRST =====
            // Read player document
            const playerDocRef = doc(db, 'users', playerId);
            const playerDoc = await transaction.get(playerDocRef);
            if (!playerDoc.exists()) throw new Error("Spieler nicht gefunden.");

            const playerData = playerDoc.data();
            let grundlagenCount = playerData.grundlagenCompleted || 0;
            let isGrundlagenExercise = false;

            // Read exercise document if needed
            if (exerciseId) {
                const exerciseRef = doc(db, 'exercises', exerciseId);
                const exerciseDoc = await transaction.get(exerciseRef);
                if (exerciseDoc.exists()) {
                    const exerciseData = exerciseDoc.data();
                    const tags = exerciseData.tags || [];
                    isGrundlagenExercise = tags.includes('Grundlage');
                }
            }
            // Also check if manual reason contains "Grundlage"
            else if (reasonType === 'manual') {
                const lowerReason = reason.toLowerCase();
                isGrundlagenExercise = lowerReason.includes('grundlage') || lowerReason.includes('grundlagen');
            }

            // Read partner document if partner system is enabled (MUST READ BEFORE ANY WRITES)
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

            // ===== PHASE 2: CALCULATE ALL VALUES =====
            // Get current values to ensure floors at 0
            const currentPoints = playerData.points || 0;
            const currentXP = playerData.xp || 0;

            // Calculate actual changes (can't go below 0) - assign to outer scope variables
            actualPointsChange = Math.max(-currentPoints, points);
            actualXPChange = Math.max(-currentXP, xpChange);

            // Calculate partner values if applicable
            if (partnerData) {
                const partnerPoints = Math.round(actualPointsChange * (partnerPercentage / 100));
                const partnerXP = Math.round(actualXPChange * (partnerPercentage / 100));

                const currentPartnerPoints = partnerData.points || 0;
                const currentPartnerXP = partnerData.xp || 0;

                actualPartnerPointsChange = Math.max(-currentPartnerPoints, partnerPoints);
                actualPartnerXPChange = Math.max(-currentPartnerXP, partnerXP);
                partnerName = `${partnerData.firstName} ${partnerData.lastName}`;
            }

            // Prepare update object for player
            const updateData = {
                points: increment(actualPointsChange),
                xp: increment(actualXPChange),
                lastXPUpdate: serverTimestamp()
            };

            // Track Grundlagen exercises
            if (isGrundlagenExercise && grundlagenCount < 5) {
                grundlagenCount++;
                updateData.grundlagenCompleted = grundlagenCount;

                // Set message for feedback
                const remaining = 5 - grundlagenCount;
                if (grundlagenCount >= 5) {
                    updateData.isMatchReady = true;
                    grundlagenMessage = ' 🎉 Grundlagen abgeschlossen - Wettkämpfe freigeschaltet!';
                } else {
                    grundlagenMessage = ` (${grundlagenCount}/5 Grundlagen - noch ${remaining} bis Wettkämpfe)`;
                }
            }

            // ===== PHASE 3: ALL WRITES =====
            // Update player document
            transaction.update(playerDocRef, updateData);

            // Points history (use actual changes)
            // Note: If partner system is enabled, this will be overwritten with partner info below
            if (!hasPartnerSystem || !partnerId) {
                const historyColRef = collection(db, `users/${playerId}/pointsHistory`);
                transaction.set(doc(historyColRef), {
                    points: actualPointsChange,
                    xp: actualXPChange, // Track actual XP change
                    eloChange: 0, // No Elo change for manual points
                    reason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`
                });

                // XP history (only if XP changed)
                if (actualXPChange !== 0) {
                    const xpHistoryColRef = collection(db, `users/${playerId}/xpHistory`);
                    transaction.set(doc(xpHistoryColRef), {
                        xp: actualXPChange,
                        reason,
                        timestamp: serverTimestamp(),
                        awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`
                    });
                }
            }

            if (challengeId) {
                const completedChallengeRef = doc(db, `users/${playerId}/completedChallenges`, challengeId);
                transaction.set(completedChallengeRef, { completedAt: serverTimestamp() });
            }

            // Update milestone progress for exercises
            if (exerciseId && reasonType === 'exercise') {
                const eOption = document.getElementById('exercise-select').options[document.getElementById('exercise-select').selectedIndex];
                if (eOption?.dataset.hasMilestones === 'true') {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (selectedMilestone && selectedMilestone.value) {
                        const milestoneCount = parseInt(selectedMilestone.dataset.count);
                        const progressRef = doc(db, `users/${playerId}/exerciseMilestones`, exerciseId);

                        transaction.set(progressRef, {
                            currentCount: milestoneCount,
                            lastUpdated: serverTimestamp(),
                            lastSeasonUpdated: new Date().getMonth() + 1 + '-' + new Date().getFullYear() // Track season
                        }, { merge: true });
                    }
                }
            }

            // Update milestone progress for challenges
            if (challengeId && reasonType === 'challenge') {
                const cOption = document.getElementById('challenge-select').options[document.getElementById('challenge-select').selectedIndex];
                if (cOption?.dataset.hasMilestones === 'true') {
                    const milestoneSelect = document.getElementById('milestone-select');
                    const selectedMilestone = milestoneSelect.options[milestoneSelect.selectedIndex];
                    if (selectedMilestone && selectedMilestone.value) {
                        const milestoneCount = parseInt(selectedMilestone.dataset.count);
                        const progressRef = doc(db, `users/${playerId}/challengeMilestones`, challengeId);

                        transaction.set(progressRef, {
                            currentCount: milestoneCount,
                            lastUpdated: serverTimestamp(),
                            lastSeasonUpdated: new Date().getMonth() + 1 + '-' + new Date().getFullYear() // Track season
                        }, { merge: true });
                    }
                }
            }

            // Award points to partner if partner system is enabled
            if (partnerData && partnerDocRef) {
                // Update partner document
                transaction.update(partnerDocRef, {
                    points: increment(actualPartnerPointsChange),
                    xp: increment(actualPartnerXPChange),
                    lastXPUpdate: serverTimestamp()
                });

                // Get active player name for partner's history
                const activePlayerName = `${playerData.firstName} ${playerData.lastName}`;
                const partnerReason = `🤝 Partner: ${reason} (mit ${activePlayerName})`;

                // Partner points history
                const partnerHistoryColRef = collection(db, `users/${partnerId}/pointsHistory`);
                transaction.set(doc(partnerHistoryColRef), {
                    points: actualPartnerPointsChange,
                    xp: actualPartnerXPChange,
                    eloChange: 0,
                    reason: partnerReason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    isPartner: true,
                    partnerId: playerId
                });

                // Partner XP history (only if XP changed)
                if (actualPartnerXPChange !== 0) {
                    const partnerXpHistoryColRef = collection(db, `users/${partnerId}/xpHistory`);
                    transaction.set(doc(partnerXpHistoryColRef), {
                        xp: actualPartnerXPChange,
                        reason: partnerReason,
                        timestamp: serverTimestamp(),
                        awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                        isPartner: true,
                        partnerId: playerId
                    });
                }

                // Also update active player's history to include partner info
                const playerHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
                const activeReason = `💪 ${reason} (Partner: ${partnerName})`;

                // Update the player's history entry with partner info
                transaction.set(playerHistoryRef, {
                    points: actualPointsChange,
                    xp: actualXPChange,
                    eloChange: 0,
                    reason: activeReason,
                    timestamp: serverTimestamp(),
                    awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    isActivePlayer: true,
                    partnerId: partnerId
                });
            }
        });

        // Build feedback message
        const sign = actualPointsChange >= 0 ? '+' : '';
        let feedbackText = `Erfolgreich ${sign}${actualPointsChange} Punkte vergeben!`;

        // Add XP info if different from points
        if (actualXPChange !== actualPointsChange) {
            const xpSign = actualXPChange >= 0 ? '+' : '';
            feedbackText += ` (${xpSign}${actualXPChange} XP)`;
        }

        // Add partner info if partner system was used
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
        feedbackEl.className = actualPointsChange >= 0 ? 'mt-3 text-sm font-medium text-center text-green-600' : 'mt-3 text-sm font-medium text-center text-orange-600';
        e.target.reset();

        // Reset manual partner system
        const manualToggle = document.getElementById('manual-partner-toggle');
        const manualContainer = document.getElementById('manual-partner-container');
        const manualPercentage = document.getElementById('manual-partner-percentage');
        if (manualToggle) manualToggle.checked = false;
        if (manualContainer) manualContainer.classList.add('hidden');
        if (manualPercentage) manualPercentage.value = 50;

        handleReasonChangeCallback();
    } catch (error) {
        console.error("Fehler bei der Punktevergabe:", error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
    setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
}

/**
 * Handles reason selection change in points form
 */
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

    // Show/hide containers
    if (challengeContainer) challengeContainer.classList.toggle('hidden', value !== 'challenge');
    if (exerciseContainer) exerciseContainer.classList.toggle('hidden', value !== 'exercise');
    if (penaltyContainer) penaltyContainer.classList.toggle('hidden', value !== 'penalty');
    if (manualContainer) manualContainer.classList.toggle('hidden', value !== 'manual');

    // Hide milestone container when switching reasons
    if (milestoneContainer) milestoneContainer.classList.add('hidden');

    // Dynamically add/remove required attribute based on visibility
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

/**
 * Sets up milestone selector logic for points awarding
 * @param {Object} db - Firestore database instance
 */
export function setupMilestoneSelectors(db) {
    console.log('🎯 Setup milestone selectors called');
    const exerciseSelect = document.getElementById('exercise-select');
    const challengeSelect = document.getElementById('challenge-select');
    const playerSelect = document.getElementById('player-select');
    const partnerSelect = document.getElementById('partner-select');

    console.log('Selectors found:', { exerciseSelect: !!exerciseSelect, challengeSelect: !!challengeSelect, playerSelect: !!playerSelect, partnerSelect: !!partnerSelect });

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
        // Reload milestone progress and partner list when player changes
        playerSelect.addEventListener('change', () => {
            const reasonType = document.getElementById('reason-select').value;
            console.log('Player changed, reason type:', reasonType);

            // Update active player name in partner info
            const activePlayerName = document.getElementById('active-player-name');
            if (activePlayerName) {
                activePlayerName.textContent = playerSelect.value ?
                    playerSelect.options[playerSelect.selectedIndex].text :
                    '-';
            }

            if (reasonType === 'exercise' || reasonType === 'challenge') {
                handleExerciseChallengeChange(db, reasonType);
            }
        });
    }

    if (partnerSelect) {
        // Update passive player name when partner changes
        partnerSelect.addEventListener('change', () => {
            const passivePlayerName = document.getElementById('passive-player-name');
            if (passivePlayerName) {
                passivePlayerName.textContent = partnerSelect.value ?
                    partnerSelect.options[partnerSelect.selectedIndex].text :
                    '-';
            }
        });
    }
}

/**
 * Handles exercise/challenge selection change to show milestones if applicable
 * @param {Object} db - Firestore database instance
 * @param {string} type - 'exercise' or 'challenge'
 */
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
        playerSelect: !!playerSelect
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
        milestonesData: selectedOption?.dataset.milestones
    });

    // Handle milestones
    if (!hasMilestones || !selectedOption.value) {
        console.log('❌ No milestones or no value, hiding milestone container');
        milestoneContainer.classList.add('hidden');
    } else {

        console.log('✅ Has milestones, showing container');
        // Show milestone container
        milestoneContainer.classList.remove('hidden');

        // Parse milestones
        const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
        const itemId = selectedOption.value;

        console.log('Milestones:', milestones);

        // Get player ID (may be null)
        const playerId = playerSelect?.value;
        console.log('Player ID:', playerId);

        // Get player's current progress (only if player is selected)
        let playerProgress = { currentCount: 0 };
        if (playerId) {
            const collectionName = type === 'exercise' ? 'exerciseMilestones' : 'challengeMilestones';
            playerProgress = await getMilestoneProgress(db, playerId, collectionName, itemId);
            console.log('Player progress:', playerProgress);
        } else {
            console.log('⚠️ No player selected yet, showing milestones without progress');
        }

        // Populate milestone dropdown
        milestoneSelect.innerHTML = '<option value="">Meilenstein wählen...</option>';

        milestones.forEach((milestone, index) => {
            const option = document.createElement('option');
            option.value = index;
            const isCompleted = playerId && playerProgress.currentCount >= milestone.count;
            const status = isCompleted ? '✅' : '';
            option.textContent = `${milestone.count}× erreicht → ${milestone.points} P. ${status}`;
            option.dataset.count = milestone.count;
            option.dataset.points = milestone.points;
            option.dataset.isCompleted = isCompleted;

            // Calculate cumulative points up to this milestone
            let cumulativePoints = 0;
            for (let i = 0; i <= index; i++) {
                cumulativePoints += milestones[i].points;
            }
            option.dataset.cumulativePoints = cumulativePoints;

            milestoneSelect.appendChild(option);
        });

        // Update progress display
        updateMilestoneProgressDisplay(playerProgress, milestones);
    }

    // Handle partner system
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
    // Show partner container
    partnerContainer.classList.remove('hidden');

    // Update percentage display
    const percentageDisplay = document.getElementById('partner-percentage');
    if (percentageDisplay) {
        percentageDisplay.textContent = partnerPercentage;
    }

    // Update active player name
    const playerId = playerSelect?.value;
    const activePlayerName = document.getElementById('active-player-name');
    if (activePlayerName) {
        const activePlayerText = playerId ?
            playerSelect.options[playerSelect.selectedIndex].text :
            '-';
        activePlayerName.textContent = activePlayerText;
    }

    // Populate partner dropdown with all players except the active player
    await populatePartnerDropdown(db, playerId);
}

/**
 * Gets a player's milestone progress
 * @param {Object} db - Firestore database instance
 * @param {string} playerId - Player ID
 * @param {string} collectionName - Collection name (exerciseMilestones or challengeMilestones)
 * @param {string} itemId - Exercise or Challenge ID
 * @returns {Object} Progress object with currentCount and completedMilestones
 */
async function getMilestoneProgress(db, playerId, collectionName, itemId) {
    try {
        const progressDocRef = doc(db, `users/${playerId}/${collectionName}`, itemId);
        const progressSnap = await getDoc(progressDocRef);

        if (progressSnap.exists()) {
            const data = progressSnap.data();
            return {
                currentCount: data.currentCount || 0,
                completedMilestones: data.completedMilestones || []
            };
        }
    } catch (error) {
        console.error('Error loading milestone progress:', error);
    }

    return { currentCount: 0, completedMilestones: [] };
}

/**
 * Updates the milestone progress display
 * @param {Object} progress - Player's progress
 * @param {Array} milestones - All milestones
 */
function updateMilestoneProgressDisplay(progress, milestones) {
    const progressText = document.getElementById('milestone-progress-text');

    if (progressText) {
        const currentCount = progress.currentCount || 0;
        const nextMilestone = milestones.find(m => m.count > currentCount);

        if (nextMilestone) {
            progressText.textContent = `${currentCount}/${nextMilestone.count} (noch ${nextMilestone.count - currentCount}× bis nächster Meilenstein)`;
        } else if (currentCount >= milestones[milestones.length - 1]?.count) {
            progressText.textContent = `${currentCount}× - Alle Meilensteine erreicht! 🎉`;
        } else {
            progressText.textContent = `${currentCount}× erreicht`;
        }
    }

    // Update milestone select change event to show points
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

/**
 * Populates the partner dropdown with all players except the active player
 * @param {Object} db - Firestore database instance
 * @param {string} activePlayerId - ID of the active player to exclude
 */
async function populatePartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('partner-select');
    if (!partnerSelect) return;

    // Clear existing options except the first one
    partnerSelect.innerHTML = '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) {
        console.log('⚠️ No active player selected, partner dropdown empty');
        return;
    }

    try {
        // Get active player's club
        const activePlayerDoc = await getDoc(doc(db, 'users', activePlayerId));
        if (!activePlayerDoc.exists()) {
            console.error('Active player document not found');
            return;
        }

        const clubId = activePlayerDoc.data().clubId;

        // Query all players from the same club
        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player')
        );

        const playersSnapshot = await getDocs(playersQuery);

        playersSnapshot.forEach(doc => {
            // Exclude the active player
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

/**
 * Populates the manual partner dropdown with all players except the active player
 * @param {Object} db - Firestore database instance
 * @param {string} activePlayerId - ID of the active player to exclude
 */
async function populateManualPartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('manual-partner-select');
    if (!partnerSelect) return;

    // Clear existing options except the first one
    partnerSelect.innerHTML = '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) {
        console.log('⚠️ No active player selected, manual partner dropdown empty');
        return;
    }

    try {
        // Get active player's club
        const activePlayerDoc = await getDoc(doc(db, 'users', activePlayerId));
        if (!activePlayerDoc.exists()) {
            console.error('Active player document not found');
            return;
        }

        const clubId = activePlayerDoc.data().clubId;

        // Query all players from the same club
        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player')
        );

        const playersSnapshot = await getDocs(playersQuery);

        playersSnapshot.forEach(doc => {
            // Exclude the active player
            if (doc.id === activePlayerId) return;

            const player = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${player.firstName} ${player.lastName}`;
            partnerSelect.appendChild(option);
        });

        console.log(`✅ Manual partner dropdown populated with ${playersSnapshot.size - 1} players`);
    } catch (error) {
        console.error('Error populating manual partner dropdown:', error);
    }
}

/**
 * Initialize manual partner system toggle and dropdown
 * @param {Object} db - Firestore database instance
 */
export function setupManualPartnerSystem(db) {
    const toggle = document.getElementById('manual-partner-toggle');
    const container = document.getElementById('manual-partner-container');
    const playerSelect = document.getElementById('player-select');

    if (!toggle || !container) return;

    // Toggle visibility
    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            container.classList.remove('hidden');
            // Populate dropdown when enabled
            const playerId = playerSelect?.value;
            if (playerId) {
                populateManualPartnerDropdown(db, playerId);
            }
        } else {
            container.classList.add('hidden');
        }
    });

    // Repopulate manual partner dropdown when player changes
    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            if (toggle.checked) {
                populateManualPartnerDropdown(db, playerSelect.value);
            }
        });
    }
}
