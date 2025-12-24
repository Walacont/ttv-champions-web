import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Season Statistics Module
 * Loads and displays season statistics (top XP, top wins)
 */

/**
 * Loads top XP players for the current season (club)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export function loadTopXPPlayers(clubId, db) {
    const topXPElement = document.getElementById('top-xp-players');
    if (!topXPElement) return;

    // Simplified query - get all players and coaches from club, then filter and sort in JS
    // Include both players and coaches (coaches can participate as players)
    const q = query(
        collection(db, 'users'),
        where('clubId', '==', clubId),
        where('role', 'in', ['player', 'coach'])
    );

    onSnapshot(
        q,
        snapshot => {
            if (snapshot.empty) {
                topXPElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Daten</p>';
                return;
            }

            // Sort by XP in JavaScript instead of Firestore
            const players = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (b.xp || 0) - (a.xp || 0))
                .slice(0, 3);

            if (players.length === 0) {
                topXPElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Daten</p>';
                return;
            }

            topXPElement.innerHTML = players
                .map((player, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                    const xp = player.xp || 0;
                    return `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700">${medal} ${player.firstName} ${player.lastName}</span>
                    <span class="font-semibold text-purple-600">${xp} XP</span>
                </div>
            `;
                })
                .join('');
        },
        error => {
            console.error('Error loading top XP players:', error);
            topXPElement.innerHTML = '<p class="text-red-500 text-xs">Fehler beim Laden</p>';
        }
    );
}

/**
 * Loads top win players for the current season (club)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export function loadTopWinsPlayers(clubId, db) {
    const topWinsElement = document.getElementById('top-wins-players');
    if (!topWinsElement) return;

    // Simplified query - get all matches from club, filter and count in JS
    const q = query(
        collection(db, 'matches'),
        where('clubId', '==', clubId),
        where('processed', '==', true)
    );

    onSnapshot(
        q,
        async snapshot => {
            if (snapshot.empty) {
                topWinsElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Daten</p>';
                return;
            }

            // Count wins per player
            const winCounts = {};
            const playerNames = {};

            for (const doc of snapshot.docs) {
                const match = doc.data();
                const winnerId = match.winnerId;

                if (!winnerId) continue;

                // Increment win count
                winCounts[winnerId] = (winCounts[winnerId] || 0) + 1;

                // Fetch player name if we don't have it yet
                if (!playerNames[winnerId]) {
                    try {
                        const playerQuery = query(
                            collection(db, 'users'),
                            where('__name__', '==', winnerId),
                            limit(1)
                        );
                        const playerDoc = await getDocs(playerQuery);
                        if (!playerDoc.empty) {
                            const playerData = playerDoc.docs[0].data();
                            playerNames[winnerId] =
                                `${playerData.firstName} ${playerData.lastName}`;
                        }
                    } catch (error) {
                        console.error('Error fetching player name:', error);
                        playerNames[winnerId] = 'Unbekannt';
                    }
                }
            }

            // Sort by win count and take top 3
            const topPlayers = Object.entries(winCounts)
                .map(([playerId, wins]) => ({
                    playerId,
                    wins,
                    name: playerNames[playerId] || 'Lädt...',
                }))
                .sort((a, b) => b.wins - a.wins)
                .slice(0, 3);

            if (topPlayers.length === 0) {
                topWinsElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Spiele</p>';
                return;
            }

            topWinsElement.innerHTML = topPlayers
                .map((player, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                    const siegText = player.wins === 1 ? 'Sieg' : 'Siege';
                    return `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700">${medal} ${player.name}</span>
                    <span class="font-semibold text-blue-600">${player.wins} ${siegText}</span>
                </div>
            `;
                })
                .join('');
        },
        error => {
            console.error('Error loading top wins players:', error);
            topWinsElement.innerHTML = '<p class="text-red-500 text-xs">Fehler beim Laden</p>';
        }
    );
}
