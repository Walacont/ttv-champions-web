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

    // Load completed challenges with error handling
    let completedChallengeIds = [];
    try {
        const completedChallengesSnap = await getDocs(collection(db, `users/${userData.id}/completedChallenges`));
        completedChallengeIds = completedChallengesSnap.docs.map(doc => doc.id);
    } catch (error) {
        console.warn('Could not load completed challenges (this is normal for new users):', error.message);
        // Continue with empty array - user hasn't completed any challenges yet
    }

    const q = query(collection(db, "challenges"), where("clubId", "==", userData.clubId), where("isActive", "==", true));

    const challengesListener = onSnapshot(q, async (snapshot) => {
        const now = new Date();
        const playerSubgroups = userData.subgroupIDs || [];

        // Load subgroup info to filter out default subgroups
        const subgroupDocs = await Promise.all(
            playerSubgroups.map(async (subgroupId) => {
                try {
                    const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
                    if (subgroupDoc.exists()) {
                        return { id: subgroupId, ...subgroupDoc.data() };
                    }
                } catch (error) {
                    console.error(`Error loading subgroup ${subgroupId}:`, error);
                }
                return null;
            })
        );

        // Filter to only non-default subgroups (specialized subgroups like U10, U13, etc.)
        const specializedSubgroups = subgroupDocs
            .filter(sg => sg !== null && !sg.isDefault)
            .map(sg => sg.id);

        let activeChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const isCompleted = completedChallengeIds.includes(challenge.id);
                const isExpired = calculateExpiry(challenge.createdAt, challenge.type) < now;

                // Only show challenges for:
                // 1. subgroupId === 'all' (for entire club), OR
                // 2. subgroupId matches one of player's specialized (non-default) subgroups
                const subgroupId = challenge.subgroupId || 'all';
                const isForPlayer = subgroupId === 'all' || specializedSubgroups.includes(subgroupId);

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

            // Add tieredPoints data
            if (challenge.tieredPoints) {
                card.dataset.tieredPoints = JSON.stringify(challenge.tieredPoints);
            }

            const subgroupBadge = challenge.subgroupId && challenge.subgroupId !== 'all'
                ? `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full ml-2">👥 ${subgroupNamesMap[challenge.subgroupId] || challenge.subgroupId}</span>`
                : '';

            // Check if challenge has tiered points
            const hasTieredPoints = challenge.tieredPoints?.enabled && challenge.tieredPoints?.milestones?.length > 0;
            const pointsBadge = hasTieredPoints
                ? `🎯 Bis zu ${challenge.points} Punkte`
                : `+${challenge.points} Punkte`;

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
                    <span class="font-bold text-indigo-600">${pointsBadge}</span>
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
    const { title, description, points, tieredPoints } = dataset;
    const titleEl = document.getElementById('modal-challenge-title');
    const descEl = document.getElementById('modal-challenge-description');
    const pointsEl = document.getElementById('modal-challenge-points');
    const modal = document.getElementById('challenge-modal');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;

    // Handle points display with milestones
    let tieredPointsData = null;
    try {
        if (tieredPoints) {
            tieredPointsData = JSON.parse(tieredPoints);
        }
    } catch (e) {
        // Invalid JSON, ignore
    }

    const milestonesContainer = document.getElementById('modal-challenge-milestones');
    const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;

    if (hasTieredPoints) {
        if (pointsEl) pointsEl.textContent = `🎯 Bis zu ${points} Punkte`;

        // Display milestones if container exists
        if (milestonesContainer) {
            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => a.count - b.count)
                .map((milestone, index) => {
                    const isFirst = index === 0;
                    const displayPoints = isFirst ? milestone.points : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
                    return `<div class="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg mb-2 border border-indigo-100">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">🎯</span>
                            <span class="text-base font-semibold text-gray-800">${milestone.count}× abgeschlossen</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold text-indigo-600">${displayPoints} P.</div>
                            <div class="text-xs text-gray-500 font-medium">Gesamt: ${milestone.points} P.</div>
                        </div>
                    </div>`;
                })
                .join('');

            milestonesContainer.innerHTML = `
                <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                    <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="text-2xl">📊</span>
                        <span>Meilensteine</span>
                    </h4>
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        if (pointsEl) pointsEl.textContent = `+${points} Punkte`;
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            milestonesContainer.classList.add('hidden');
        }
    }

    if (modal) modal.classList.remove('hidden');
}
