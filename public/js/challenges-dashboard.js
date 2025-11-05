import { collection, getDocs, getDoc, doc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { calculateExpiry } from './challenges.js';

/**
 * Challenges Dashboard Module
 * Handles challenge loading and display for player dashboard
 */

/**
 * Loads active challenges for a player
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export async function loadChallenges(userData, db, unsubscribes) {
    const challengesListEl = document.getElementById('challenges-list');
    if (!challengesListEl) return;

    const completedChallengesSnap = await getDocs(collection(db, `users/${userData.id}/completedChallenges`));
    const completedChallengeIds = completedChallengesSnap.docs.map(doc => doc.id);
    const q = query(collection(db, "challenges"), where("clubId", "==", userData.clubId), where("isActive", "==", true));

    const challengesListener = onSnapshot(q, async (snapshot) => {
        const now = new Date();
        const playerSubgroups = userData.subgroupIDs || [];

        let activeChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const isCompleted = completedChallengeIds.includes(challenge.id);
                const isExpired = calculateExpiry(challenge.createdAt, challenge.type) < now;

                // Only show challenges for player's subgroups or "all"
                const subgroupId = challenge.subgroupId || 'all';
                const isForPlayer = subgroupId === 'all' || playerSubgroups.includes(subgroupId);

                return !isCompleted && !isExpired && isForPlayer;
            });

        if (activeChallenges.length === 0) {
            challengesListEl.innerHTML = snapshot.empty
                ? `<p class="text-gray-400">Derzeit keine aktiven Challenges.</p>`
                : `<p class="text-green-500">Super! Du hast alle aktiven Challenges abgeschlossen.</p>`;
            return;
        }

        // Load subgroup names for badges
        const subgroupNamesMap = {};
        for (const challenge of activeChallenges) {
            if (challenge.subgroupId && challenge.subgroupId !== 'all' && !subgroupNamesMap[challenge.subgroupId]) {
                try {
                    const subgroupDoc = await getDoc(doc(db, 'subgroups', challenge.subgroupId));
                    if (subgroupDoc.exists()) {
                        subgroupNamesMap[challenge.subgroupId] = subgroupDoc.data().name;
                    }
                } catch (error) {
                    console.error("Error loading subgroup name:", error);
                }
            }
        }

        challengesListEl.innerHTML = '';
        activeChallenges.forEach(challenge => {
            const card = document.createElement('div');
            card.className = 'challenge-card bg-gray-50 p-4 rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-shadow';
            card.dataset.id = challenge.id;
            card.dataset.title = challenge.title;
            card.dataset.description = challenge.description || '';
            card.dataset.points = challenge.points;
            card.dataset.type = challenge.type;

            const subgroupBadge = challenge.subgroupId && challenge.subgroupId !== 'all'
                ? `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full ml-2">👥 ${subgroupNamesMap[challenge.subgroupId] || challenge.subgroupId}</span>`
                : '';

            card.innerHTML = `
                <div class="flex justify-between items-start pointer-events-none">
                    <div class="flex items-center flex-wrap gap-1">
                        <h3 class="font-bold">${challenge.title}</h3>
                        ${subgroupBadge}
                    </div>
                    <span class="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                </div>
                <p class="text-sm text-gray-600 my-2 pointer-events-none">${challenge.description || ''}</p>
                <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t pointer-events-none">
                    <span class="font-bold text-indigo-600">+${challenge.points} Punkte</span>
                </div>
            `;
            challengesListEl.appendChild(card);
        });
    });
    unsubscribes.push(challengesListener);
}

/**
 * Opens the challenge modal
 * @param {Object} dataset - Challenge data from card dataset
 */
export function openChallengeModal(dataset) {
    const { title, description, points } = dataset;
    const titleEl = document.getElementById('modal-challenge-title');
    const descEl = document.getElementById('modal-challenge-description');
    const pointsEl = document.getElementById('modal-challenge-points');
    const modal = document.getElementById('challenge-modal');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    if (pointsEl) pointsEl.textContent = `+${points} Punkte`;
    if (modal) modal.classList.remove('hidden');
}
