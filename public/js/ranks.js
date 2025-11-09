/**
 * Ranks Module
 * New permanent rank system based on Elo + XP (replacing seasonal leagues)
 */

/**
 * Rank definitions with requirements
 * Both Elo AND XP must be met to achieve a rank
 * *** NEUES PUNKTESYSTEM 2024 ***
 * Elo startet bei 800, XP-Schwellenwerte reduziert für schnelleren Fortschritt
 */
export const RANKS = {
    REKRUT: {
        id: 0,
        name: 'Rekrut',
        emoji: '🔰',
        color: '#9CA3AF', // gray-400
        minElo: 800,
        minXP: 0,
        description: 'Willkommen! Absolviere 5 Grundlagen-Übungen.',
        isOnboarding: true,
        requiresGrundlagen: false  // No requirement for Rekrut itself
    },
    BRONZE: {
        id: 1,
        name: 'Bronze',
        emoji: '🥉',
        color: '#CD7F32',
        minElo: 850,
        minXP: 50,  // REDUZIERT (war 100) - Schnellerer Aufstieg!
        description: 'Du hast die Grundlagen gemeistert!',
        requiresGrundlagen: true,  // Must complete 5 Grundlage exercises to reach Bronze
        grundlagenRequired: 5
    },
    SILBER: {
        id: 2,
        name: 'Silber',
        emoji: '🥈',
        color: '#C0C0C0',
        minElo: 1000,  // Neues System
        minXP: 200,    // REDUZIERT (war 250)
        description: 'Du bist auf dem besten Weg!',
        requiresGrundlagen: false
    },
    GOLD: {
        id: 3,
        name: 'Gold',
        emoji: '🥇',
        color: '#FFD700',
        minElo: 1200,  // Neues System
        minXP: 500,
        description: 'Ein echter Champion!',
        requiresGrundlagen: false
    },
    PLATIN: {
        id: 4,
        name: 'Platin',
        emoji: '💎',
        color: '#E5E4E2',
        minElo: 1400,   // Neues System
        minXP: 1000,    // REDUZIERT (war 1500)
        description: 'Du gehörst zur Elite!',
        requiresGrundlagen: false
    },
    CHAMPION: {
        id: 5,
        name: 'Champion',
        emoji: '👑',
        color: '#9333EA', // purple-600
        minElo: 1600,   // Neues System
        minXP: 1800,    // REDUZIERT (war 2500)
        description: 'Der höchste Rang - du bist ein Vereinsmeister!',
        requiresGrundlagen: false
    }
};

/**
 * Ordered array of ranks (lowest to highest)
 */
export const RANK_ORDER = [
    RANKS.REKRUT,
    RANKS.BRONZE,
    RANKS.SILBER,
    RANKS.GOLD,
    RANKS.PLATIN,
    RANKS.CHAMPION
];

/**
 * Calculate a player's current rank based on their Elo and XP
 * Returns the HIGHEST rank where BOTH requirements are met
 * @param {number} eloRating - Player's current Elo rating
 * @param {number} xp - Player's total XP
 * @param {number} grundlagenCount - Number of completed "Grundlage" exercises (optional)
 * @returns {Object} Rank object
 */
export function calculateRank(eloRating, xp, grundlagenCount = 0) {
    const elo = eloRating ?? 800; // Default starting Elo is now 800 (use ?? to handle 0 properly)
    const totalXP = xp || 0;

    // Start from highest rank and work down
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];

        // Check basic requirements (Elo + XP)
        const meetsBasicRequirements = elo >= rank.minElo && totalXP >= rank.minXP;

        // Check special Grundlagen requirement for Bronze
        if (rank.requiresGrundlagen) {
            const required = rank.grundlagenRequired || 5;
            if (meetsBasicRequirements && grundlagenCount >= required) {
                return rank;
            }
        } else {
            if (meetsBasicRequirements) {
                return rank;
            }
        }
    }

    // Fallback to Rekrut if nothing matches
    return RANKS.REKRUT;
}

/**
 * Get the next rank and progress towards it
 * @param {number} eloRating - Player's current Elo rating
 * @param {number} xp - Player's total XP
 * @param {number} grundlagenCount - Number of completed "Grundlage" exercises
 * @returns {Object} { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded, grundlagenNeeded }
 */
export function getRankProgress(eloRating, xp, grundlagenCount = 0) {
    const currentRank = calculateRank(eloRating, xp, grundlagenCount);
    const currentIndex = RANK_ORDER.findIndex(r => r.id === currentRank.id);

    // Check if max rank
    if (currentIndex === RANK_ORDER.length - 1) {
        return {
            currentRank,
            nextRank: null,
            eloProgress: 100,
            xpProgress: 100,
            eloNeeded: 0,
            xpNeeded: 0,
            grundlagenNeeded: 0,
            isMaxRank: true
        };
    }

    const nextRank = RANK_ORDER[currentIndex + 1];
    const elo = eloRating || 0;
    const totalXP = xp || 0;

    // Calculate progress towards next rank
    const eloNeeded = Math.max(0, nextRank.minElo - elo);
    const xpNeeded = Math.max(0, nextRank.minXP - totalXP);
    const grundlagenRequired = nextRank.grundlagenRequired || 5;
    const grundlagenNeeded = nextRank.requiresGrundlagen ? Math.max(0, grundlagenRequired - grundlagenCount) : 0;

    // Progress percentage (0-100)
    // Handle potential division by zero if minElo/minXP is 0
    const eloProgress = nextRank.minElo === 0 ? (elo > 0 ? 100 : 0) : Math.min(100, (elo / nextRank.minElo) * 100);
    const xpProgress = nextRank.minXP === 0 ? (totalXP > 0 ? 100 : 0) : Math.min(100, (totalXP / nextRank.minXP) * 100);
    const grundlagenProgress = nextRank.requiresGrundlagen ? Math.min(100, (grundlagenCount / grundlagenRequired) * 100) : 100;


    return {
        currentRank,
        nextRank,
        eloProgress: Math.round(eloProgress),
        xpProgress: Math.round(xpProgress),
        grundlagenProgress: Math.round(grundlagenProgress),
        eloNeeded,
        xpNeeded,
        grundlagenNeeded,
        isMaxRank: false
    };
}

/**
 * Get rank by ID
 * @param {number} rankId - Rank ID
 * @returns {Object} Rank object or null
 */
export function getRankById(rankId) {
    return RANK_ORDER.find(r => r.id === rankId) || null;
}

/**
 * Get rank by name
 * @param {string} rankName - Rank name
 * @returns {Object} Rank object or null
 */
export function getRankByName(rankName) {
    const upperName = rankName.toUpperCase();
    return RANKS[upperName] || null;
}

/**
 * Format rank display with emoji and name
 * @param {Object} rank - Rank object
 * @returns {string} Formatted string like "🥇 Gold"
 */
export function formatRank(rank) {
    if (!rank) return '🎖️ Rekrut';
    return `${rank.emoji} ${rank.name}`;
}

/**
 * Get all players grouped by rank
 * @param {Array} players - Array of player objects with eloRating and xp
 * @returns {Object} Object with rank IDs as keys and arrays of players as values
 */
export function groupPlayersByRank(players) {
    const grouped = {};

    // Initialize all ranks
    RANK_ORDER.forEach(rank => {
        grouped[rank.id] = [];
    });

    // Categorize players
    players.forEach(player => {
        // Spieler-Objekt um grundlagenCount erweitern, falls es fehlt
        const playerWithGrundlagen = {
            ...player,
            grundlagenCompleted: player.grundlagenCompleted || 0
        };
        
        const rank = calculateRank(playerWithGrundlagen.eloRating, playerWithGrundlagen.xp, playerWithGrundlagen.grundlagenCompleted);
        
        grouped[rank.id].push({
            ...playerWithGrundlagen,
            rank
        });
    });

    return grouped;
}