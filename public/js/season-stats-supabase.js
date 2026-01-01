/**
 * Season Statistics Module (Supabase Version)
 * Loads and displays season statistics (top XP, top wins)
 */

/**
 * Maps player from Supabase (snake_case) to app format (camelCase)
 */
function mapPlayerFromSupabase(player) {
    return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        role: player.role,
        xp: player.xp,
        points: player.points,
        eloRating: player.elo_rating
    };
}

/**
 * Loads top XP players for the current season (club)
 * @param {string} clubId - Vereins-ID
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {Function} setUnsubscribeCallback - Optionaler Callback für Unsubscribe-Funktion
 */
export function loadTopXPPlayers(clubId, supabase, setUnsubscribeCallback = null) {
    const topXPElement = document.getElementById('top-xp-players');
    if (!topXPElement) return;

    async function fetchAndRender() {
        try {
            // Alle Spieler und Trainer vom Verein abrufen
            const { data, error } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, role, xp')
                .eq('club_id', clubId)
                .in('role', ['player', 'coach', 'head_coach']);

            if (error) throw error;

            if (!data || data.length === 0) {
                topXPElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Daten</p>';
                return;
            }

            // Nach XP sortieren und Top 3 nehmen
            const players = data
                .map(p => mapPlayerFromSupabase(p))
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
        } catch (error) {
            console.error('Error loading top XP players:', error);
            topXPElement.innerHTML = '<p class="text-red-500 text-xs">Fehler beim Laden</p>';
        }
    }

    // Initial fetch
    fetchAndRender();

    // Set up real-time subscription
    const subscription = supabase
        .channel('season-stats-xp')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                fetchAndRender();
            }
        )
        .subscribe();

    if (setUnsubscribeCallback) {
        setUnsubscribeCallback(subscription);
    }

    return subscription;
}

/**
 * Loads top win players for the current season (club)
 * @param {string} clubId - Vereins-ID
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {Function} setUnsubscribeCallback - Optionaler Callback für Unsubscribe-Funktion
 */
export function loadTopWinsPlayers(clubId, supabase, setUnsubscribeCallback = null) {
    const topWinsElement = document.getElementById('top-wins-players');
    if (!topWinsElement) return;

    async function fetchAndRender() {
        try {
            // Alle verarbeiteten Matches vom Verein abrufen
            const { data: matchesData, error: matchesError } = await supabase
                .from('matches')
                .select('winner_id')
                .eq('club_id', clubId)
                .eq('processed', true);

            if (matchesError) throw matchesError;

            if (!matchesData || matchesData.length === 0) {
                topWinsElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Daten</p>';
                return;
            }

            // Count wins per player
            const winCounts = {};
            matchesData.forEach(match => {
                const winnerId = match.winner_id;
                if (!winnerId) return;
                winCounts[winnerId] = (winCounts[winnerId] || 0) + 1;
            });

            // Get unique winner IDs
            const winnerIds = Object.keys(winCounts);

            if (winnerIds.length === 0) {
                topWinsElement.innerHTML = '<p class="text-gray-400 text-xs">Keine Spiele</p>';
                return;
            }

            // Fetch player names
            const { data: playersData, error: playersError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', winnerIds);

            if (playersError) throw playersError;

            // Build player names map
            const playerNames = {};
            (playersData || []).forEach(player => {
                playerNames[player.id] = `${player.first_name} ${player.last_name}`;
            });

            // Nach Sieganzahl sortieren und Top 3 nehmen
            const topPlayers = Object.entries(winCounts)
                .map(([playerId, wins]) => ({
                    playerId,
                    wins,
                    name: playerNames[playerId] || 'Unbekannt',
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
        } catch (error) {
            console.error('Error loading top wins players:', error);
            topWinsElement.innerHTML = '<p class="text-red-500 text-xs">Fehler beim Laden</p>';
        }
    }

    // Initial fetch
    fetchAndRender();

    // Set up real-time subscription
    const subscription = supabase
        .channel('season-stats-wins')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'matches',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                fetchAndRender();
            }
        )
        .subscribe();

    if (setUnsubscribeCallback) {
        setUnsubscribeCallback(subscription);
    }

    return subscription;
}
