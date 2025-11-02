import { collection, query, where, orderBy, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
    feedbackEl.textContent = '';
    if (!title || !type || isNaN(points) || points <= 0) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }
    try {
        await addDoc(collection(db, "challenges"), { title, type, description, points, clubId: currentUserData.clubId, isActive: true, createdAt: serverTimestamp() });
        feedbackEl.textContent = 'Challenge erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
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
 */
export function loadActiveChallenges(clubId, db) {
    const activeChallengesList = document.getElementById('active-challenges-list');
    if (!activeChallengesList) return;
    const q = query(collection(db, "challenges"), where("clubId", "==", clubId), where("isActive", "==", true), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        activeChallengesList.innerHTML = '';
        const now = new Date();
        const challenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => calculateExpiry(challenge.createdAt, challenge.type) > now);
        if (challenges.length === 0) {
            activeChallengesList.innerHTML = '<p class="text-gray-500">Keine aktiven Challenges für deinen Verein gefunden.</p>';
            return;
        }
        challenges.forEach(challenge => {
            const card = document.createElement('div');
            card.className = 'p-4 border rounded-lg bg-gray-50';
            const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
            card.innerHTML = ` <div class="flex justify-between items-center"> <h3 class="font-bold">${challenge.title}</h3> <span class="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full uppercase">${challenge.type}</span> </div> <p class="text-sm text-gray-600 my-2">${challenge.description || ''}</p> <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t"> <span class="font-bold text-indigo-600">+${challenge.points} Punkte</span> <span class="challenge-countdown font-mono text-red-600" data-expires-at="${expiresAt.toISOString()}">Berechne...</span> </div> `;
            activeChallengesList.appendChild(card);
        });
        updateAllCountdowns();
    }, error => {
        console.error("Fehler beim Laden der aktiven Challenges:", error);
        activeChallengesList.innerHTML = '<p class="text-red-500">Fehler beim Laden der Challenges. Möglicherweise wird ein Index benötigt.</p>';
    });
}

/**
 * Loads challenges for dropdown selection
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export function loadChallengesForDropdown(clubId, db) {
    const select = document.getElementById('challenge-select');
    if (!select) return;
    const q = query(collection(db, 'challenges'), where('clubId', '==', clubId), where('isActive', '==', true));
    onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            select.innerHTML = '<option value="">Keine aktiven Challenges</option>';
            return;
        }
        select.innerHTML = '<option value="">Challenge wählen...</option>';
        snapshot.forEach(doc => {
            const c = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${c.title} (+${c.points} P.)`;
            option.dataset.points = c.points;
            option.dataset.title = c.title;
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
