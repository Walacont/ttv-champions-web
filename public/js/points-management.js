import { collection, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, increment, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

            const li = document.createElement('li');
            li.className = 'flex justify-between items-start text-sm';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}</p>
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

            const li = document.createElement('li');
            li.className = 'flex justify-between items-start text-sm bg-gray-50 p-2 rounded-md';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}</p>
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
                points = parseInt(cOption.dataset.points);
                xpChange = points; // XP = points for challenges
                reason = `Challenge: ${cOption.dataset.title}`;
                challengeId = cOption.value;
                challengeSubgroupId = cOption.dataset.subgroupId || 'all';
                break;
            case 'exercise':
                const eSelect = document.getElementById('exercise-select');
                const eOption = eSelect.options[eSelect.selectedIndex];
                if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.');
                points = parseInt(eOption.dataset.points);
                xpChange = points; // XP = points for exercises
                reason = `Übung: ${eOption.dataset.title}`;
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

        await runTransaction(db, async (transaction) => {
            const playerDocRef = doc(db, 'users', playerId);
            const playerDoc = await transaction.get(playerDocRef);
            if (!playerDoc.exists()) throw new Error("Spieler nicht gefunden.");

            const playerData = playerDoc.data();
            let grundlagenCount = playerData.grundlagenCompleted || 0;
            let isGrundlagenExercise = false;

            // Check if this is a "Grundlage" exercise (from exercise selection)
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

            // Get current values to ensure floors at 0
            const currentPoints = playerData.points || 0;
            const currentXP = playerData.xp || 0;

            // Calculate actual changes (can't go below 0)
            const actualPointsChange = Math.max(-currentPoints, points);
            const actualXPChange = Math.max(-currentXP, xpChange);

            // Prepare update object
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

            // Update player document
            transaction.update(playerDocRef, updateData);

            // Points history (use actual changes)
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

            if (challengeId) {
                const completedChallengeRef = doc(db, `users/${playerId}/completedChallenges`, challengeId);
                transaction.set(completedChallengeRef, { completedAt: serverTimestamp() });
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

        feedbackText += grundlagenMessage;

        feedbackEl.textContent = feedbackText;
        feedbackEl.className = actualPointsChange >= 0 ? 'mt-3 text-sm font-medium text-center text-green-600' : 'mt-3 text-sm font-medium text-center text-orange-600';
        e.target.reset();
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

    const challengeSelect = document.getElementById('challenge-select');
    const exerciseSelect = document.getElementById('exercise-select');
    const penaltyReason = document.getElementById('penalty-reason');

    // Show/hide containers
    if (challengeContainer) challengeContainer.classList.toggle('hidden', value !== 'challenge');
    if (exerciseContainer) exerciseContainer.classList.toggle('hidden', value !== 'exercise');
    if (penaltyContainer) penaltyContainer.classList.toggle('hidden', value !== 'penalty');
    if (manualContainer) manualContainer.classList.toggle('hidden', value !== 'manual');

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
