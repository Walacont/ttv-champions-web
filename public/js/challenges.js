import { collection, query, where, orderBy, addDoc, onSnapshot, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Challenges Module
 * Handles challenge creation, display, and countdown timers
 */

/**
 * Handles challenge creation form submission
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 */
export async function handleCreateChallenge(e, db, currentUserData) {
    e.preventDefault();
    const feedbackEl = document.getElementById('challenge-feedback');
    const title = document.getElementById('challenge-title').value;
    const type = document.getElementById('challenge-type').value;
    const description = document.getElementById('challenge-description').value;
    const points = parseInt(document.getElementById('challenge-points').value);
    const subgroupId = document.getElementById('challenge-subgroup').value;

    feedbackEl.textContent = '';
    if (!title || !type || isNaN(points) || points <= 0 || !subgroupId) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }
    try {
        const challengeData = {
            title,
            type,
            description,
            points,
            clubId: currentUserData.clubId,
            subgroupId: subgroupId,
            isActive: true,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "challenges"), challengeData);
        feedbackEl.textContent = 'Challenge erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
        // Reset dropdown to "all"
        document.getElementById('challenge-subgroup').value = 'all';
    } catch (error) {
        console.error("Fehler beim Erstellen der Challenge:", error);
        feedbackEl.textContent = 'Fehler: Challenge konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
    setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
}

/**
 * Loads and displays active challenges for the club
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function loadActiveChallenges(clubId, db, currentSubgroupFilter = 'all') {
    const activeChallengesList = document.getElementById('active-challenges-list');
    if (!activeChallengesList) return;
    const q = query(collection(db, "challenges"), where("clubId", "==", clubId), where("isActive", "==", true), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        activeChallengesList.innerHTML = '';
        const now = new Date();
        let challenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => calculateExpiry(challenge.createdAt, challenge.type) > now);

        // Filter by subgroup
        if (currentSubgroupFilter !== 'all') {
            challenges = challenges.filter(challenge =>
                challenge.subgroupId === currentSubgroupFilter || challenge.subgroupId === 'all'
            );
        }

        if (challenges.length === 0) {
            activeChallengesList.innerHTML = '<p class="text-gray-500">Keine aktiven Challenges für diese Ansicht gefunden.</p>';
            return;
        }
        challenges.forEach(challenge => {
            const card = document.createElement('div');
            card.className = 'p-4 border rounded-lg bg-gray-50';
            const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <h3 class="font-bold">${challenge.title}</h3>
                    <span class="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                </div>
                <p class="text-sm text-gray-600 my-2">${challenge.description || ''}</p>
                <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t">
                    <span class="font-bold text-indigo-600">+${challenge.points} Punkte</span>
                    <span class="challenge-countdown font-mono text-red-600" data-expires-at="${expiresAt.toISOString()}">Berechne...</span>
                </div>
                <div class="flex gap-2 mt-3">
                    <button onclick="confirmEndChallenge('${challenge.id}', '${challenge.title}')"
                            class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded">
                        🛑 Beenden
                    </button>
                </div>
            `;
            activeChallengesList.appendChild(card);
        });
        updateAllCountdowns();
    }, error => {
        console.error("Fehler beim Laden der aktiven Challenges:", error);
        activeChallengesList.innerHTML = '<p class="text-red-500">Fehler beim Laden der Challenges. Möglicherweise wird ein Index benötigt.</p>';
    });
}

/**
 * Loads challenges for dropdown selection (used in points assignment)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function loadChallengesForDropdown(clubId, db, currentSubgroupFilter = 'all') {
    const select = document.getElementById('challenge-select');
    if (!select) return;
    const q = query(collection(db, 'challenges'), where('clubId', '==', clubId), where('isActive', '==', true));
    onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            select.innerHTML = '<option value="">Keine aktiven Challenges</option>';
            return;
        }
        select.innerHTML = '<option value="">Challenge wählen...</option>';

        const now = new Date();
        let activeChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                return expiresAt > now; // Only show non-expired challenges
            });

        // Filter by subgroup (only show challenges for current subgroup or "all")
        if (currentSubgroupFilter !== 'all') {
            activeChallenges = activeChallenges.filter(challenge =>
                challenge.subgroupId === currentSubgroupFilter || challenge.subgroupId === 'all'
            );
        }

        if (activeChallenges.length === 0) {
            select.innerHTML = '<option value="">Keine passenden Challenges</option>';
            return;
        }

        activeChallenges.forEach(challenge => {
            const option = document.createElement('option');
            option.value = challenge.id;
            option.textContent = `${challenge.title} (+${challenge.points} P.)`;
            option.dataset.points = challenge.points;
            option.dataset.title = challenge.title;
            select.appendChild(option);
        });
    });
}

/**
 * Calculates the expiry date for a challenge based on type
 * @param {Timestamp} createdAt - Firestore timestamp when challenge was created
 * @param {string} type - Challenge type (daily, weekly, monthly)
 * @returns {Date} Expiry date
 */
export function calculateExpiry(createdAt, type) {
    if (!createdAt || !createdAt.toDate) return new Date();
    const startDate = createdAt.toDate();
    const expiryDate = new Date(startDate);
    switch (type) {
        case 'daily':
            expiryDate.setDate(startDate.getDate() + 1);
            break;
        case 'weekly':
            expiryDate.setDate(startDate.getDate() + 7);
            break;
        case 'monthly':
            expiryDate.setMonth(startDate.getMonth() + 1);
            break;
    }
    return expiryDate;
}

/**
 * Loads expired challenges for the club
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export function loadExpiredChallenges(clubId, db) {
    const expiredChallengesList = document.getElementById('expired-challenges-list');
    if (!expiredChallengesList) return;

    const q = query(collection(db, "challenges"), where("clubId", "==", clubId), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        expiredChallengesList.innerHTML = '';
        const now = new Date();

        const expiredChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                // Show if expired OR manually ended
                return expiresAt <= now || challenge.isActive === false;
            });

        if (expiredChallenges.length === 0) {
            expiredChallengesList.innerHTML = '<p class="text-gray-500">Keine abgelaufenen Challenges gefunden.</p>';
            return;
        }

        expiredChallenges.forEach(challenge => {
            const card = document.createElement('div');
            card.className = 'p-4 border rounded-lg bg-gray-50';
            const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
            const wasManuallyEnded = challenge.isActive === false;

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-gray-700">${challenge.title}</h3>
                    <span class="text-xs font-semibold bg-gray-300 text-gray-600 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                </div>
                <p class="text-sm text-gray-600 my-2">${challenge.description || ''}</p>
                <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t">
                    <span class="font-bold text-gray-600">+${challenge.points} Punkte</span>
                    <span class="text-xs text-gray-500">
                        ${wasManuallyEnded ? 'Vorzeitig beendet' : 'Abgelaufen am ' + expiresAt.toLocaleDateString('de-DE')}
                    </span>
                </div>
                <div class="flex gap-2 mt-3">
                    <button onclick="showReactivateModal('${challenge.id}', '${challenge.title}')"
                            class="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded">
                        🔄 Reaktivieren
                    </button>
                </div>
            `;
            expiredChallengesList.appendChild(card);
        });
    }, error => {
        console.error("Fehler beim Laden der abgelaufenen Challenges:", error);
        expiredChallengesList.innerHTML = '<p class="text-red-500">Fehler beim Laden.</p>';
    });
}

/**
 * Reactivates a challenge with a new duration and subgroup
 * @param {string} challengeId - Challenge ID
 * @param {string} duration - New duration (daily, weekly, monthly)
 * @param {string} subgroupId - Subgroup ID (or "all")
 * @param {Object} db - Firestore database instance
 */
export async function reactivateChallenge(challengeId, duration, subgroupId, db) {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await updateDoc(challengeRef, {
            createdAt: serverTimestamp(),
            type: duration,
            subgroupId: subgroupId,
            isActive: true
        });
        return { success: true };
    } catch (error) {
        console.error('Error reactivating challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Ends a challenge early
 * @param {string} challengeId - Challenge ID
 * @param {Object} db - Firestore database instance
 */
export async function endChallenge(challengeId, db) {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await updateDoc(challengeRef, {
            isActive: false
        });
        return { success: true };
    } catch (error) {
        console.error('Error ending challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates all countdown timers on the page
 */
export function updateAllCountdowns() {
    const countdownElements = document.querySelectorAll('.challenge-countdown');
    const now = new Date();
    countdownElements.forEach(el => {
        const expiresAt = new Date(el.dataset.expiresAt);
        const diff = expiresAt - now;
        if (diff <= 0) {
            el.textContent = "Abgelaufen";
            el.classList.remove('text-red-600');
            el.classList.add('text-gray-500');
            return;
        }
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        el.textContent = `Verbleibend: ${days}T ${hours}h ${minutes}m ${seconds}s`;
    });
}

/**
 * Populates a subgroup dropdown with subgroups from the club
 * @param {string} clubId - Club ID
 * @param {string} selectId - ID of the select element
 * @param {Object} db - Firestore database instance
 */
export function populateSubgroupDropdown(clubId, selectId, db) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    onSnapshot(q, (snapshot) => {
        // Keep the "Alle" option
        const currentValue = select.value;
        select.innerHTML = '<option value="all">Alle (Gesamtverein)</option>';

        snapshot.forEach(doc => {
            const subgroup = doc.data();
            // Skip default/main subgroups (Hauptgruppe) as they're equivalent to "all"
            if (subgroup.isDefault) {
                return;
            }
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = subgroup.name;
            select.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }, (error) => {
        console.error("Error loading subgroups for dropdown:", error);
    });
}
