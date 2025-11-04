import { collection, doc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}</p>
                    <p class="text-xs text-gray-500">${date}</p>
                </div>
                <span class="font-bold ${pointsClass}">${sign}${entry.points}</span>
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

            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm bg-gray-50 p-2 rounded-md';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}</p>
                    <p class="text-xs text-gray-500">${date} - ${entry.awardedBy || 'Unbekannt'}</p>
                </div>
                <span class="font-bold ${pointsClass}">${sign}${entry.points}</span>
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
    let reason = '';
    let challengeId = null;
    let exerciseId = null;

    try {
        switch (reasonType) {
            case 'challenge':
                const cSelect = document.getElementById('challenge-select');
                const cOption = cSelect.options[cSelect.selectedIndex];
                if (!cOption || !cOption.value) throw new Error('Bitte eine Challenge auswählen.');
                points = parseInt(cOption.dataset.points);
                reason = `Challenge: ${cOption.dataset.title}`;
                challengeId = cOption.value;
                break;
            case 'exercise':
                const eSelect = document.getElementById('exercise-select');
                const eOption = eSelect.options[eSelect.selectedIndex];
                if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.');
                points = parseInt(eOption.dataset.points);
                reason = `Übung: ${eOption.dataset.title}`;
                exerciseId = eOption.value;
                break;
            case 'manual':
                points = parseInt(document.getElementById('manual-points').value);
                reason = document.getElementById('manual-reason').value;
                if (!reason || isNaN(points)) throw new Error('Grund und gültige Punkte müssen angegeben werden.');
                break;
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

            // Prepare update object
            const updateData = {
                points: increment(points),
                xp: increment(points),
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

            // Points history
            const historyColRef = collection(db, `users/${playerId}/pointsHistory`);
            transaction.set(doc(historyColRef), {
                points,
                reason,
                timestamp: serverTimestamp(),
                awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`
            });

            // XP history
            const xpHistoryColRef = collection(db, `users/${playerId}/xpHistory`);
            transaction.set(doc(xpHistoryColRef), {
                xp: points,
                reason,
                timestamp: serverTimestamp(),
                awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}`
            });

            if (challengeId) {
                const completedChallengeRef = doc(db, `users/${playerId}/completedChallenges`, challengeId);
                transaction.set(completedChallengeRef, { completedAt: serverTimestamp() });
            }
        });

        feedbackEl.textContent = `Erfolgreich ${points} Punkte vergeben!${grundlagenMessage}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
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
    const manualContainer = document.getElementById('manual-points-container');

    if (challengeContainer) challengeContainer.classList.toggle('hidden', value !== 'challenge');
    if (exerciseContainer) exerciseContainer.classList.toggle('hidden', value !== 'exercise');
    if (manualContainer) manualContainer.classList.toggle('hidden', value !== 'manual');
}
