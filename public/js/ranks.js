/**
 * Ranks Module
 * New permanent rank system based on Elo + XP (replacing seasonal leagues)
 */

/**
 * Rank definitions with requirements
 * Both Elo AND XP must be met to achieve a rank
 */
export const RANKS = {
    REKRUT: {
        id: 0,
        name: 'Rekrut',
        emoji: '🎖️',
        color: '#9CA3AF', // gray-400
        minElo: 1200,
        minXP: 0,
        description: 'Willkommen! Absolviere die Grundlagen-Übungen.',
        isOnboarding: true
    },
    BRONZE: {
        id: 1,
        name: 'Bronze',
        emoji: '🥉',
        color: '#CD7F32',
        minElo: 1250,
        minXP: 150,
        description: 'Du hast die Grundlagen gemeistert!'
    },
    SILBER: {
        id: 2,
        name: 'Silber',
        emoji: '🥈',
        color: '#C0C0C0',
        minElo: 1300,
        minXP: 500,
        description: 'Du bist auf dem besten Weg!'
    },
    GOLD: {
        id: 3,
        name: 'Gold',
        emoji: '🥇',
        color: '#FFD700',
        minElo: 1400,
        minXP: 1500,
        description: 'Ein echter Champion!'
    },
    PLATIN: {
        id: 4,
        name: 'Platin',
        emoji: '💎',
        color: '#E5E4E2',
        minElo: 1550,
        minXP: 4000,
        description: 'Du gehörst zur Elite!'
    },
    MEISTER: {
        id: 5,
        name: 'Meister',
        emoji: '👑',
        color: '#9333EA', // purple-600
        minElo: 1750,
        minXP: 10000,
        description: 'Ein wahrer Meister des Tischtennissports!'
    },
    GROSSMEISTER: {
        id: 6,
        name: 'Großmeister',
        emoji: '🏆',
        color: '#DC2626', // red-600
        minElo: 2000,
        minXP: 25000,
        description: 'Legende! Du hast alles erreicht!'
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
    RANKS.MEISTER,
    RANKS.GROSSMEISTER
];

/**
 * Calculate a player's current rank based on their Elo and XP
 * Returns the HIGHEST rank where BOTH requirements are met
 * @param {number} eloRating - Player's current Elo rating
 * @param {number} xp - Player's total XP
 * @returns {Object} Rank object
 */
export function calculateRank(eloRating, xp) {
    const elo = eloRating || 1200; // Default starting Elo
    const totalXP = xp || 0;

    // Start from highest rank and work down
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];
        if (elo >= rank.minElo && totalXP >= rank.minXP) {
            return rank;
        }
    }

    // Fallback to Rekrut if nothing matches
    return RANKS.REKRUT;
}

/**
 * Get the next rank and progress towards it
 * @param {number} eloRating - Player's current Elo rating
 * @param {number} xp - Player's total XP
 * @returns {Object} { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded }
 */
export function getRankProgress(eloRating, xp) {
    const currentRank = calculateRank(eloRating, xp);
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
            isMaxRank: true
        };
    }

    const nextRank = RANK_ORDER[currentIndex + 1];
    const elo = eloRating || 1200;
    const totalXP = xp || 0;

    // Calculate progress towards next rank
    const eloNeeded = Math.max(0, nextRank.minElo - elo);
    const xpNeeded = Math.max(0, nextRank.minXP - totalXP);

    // Progress percentage (0-100)
    const eloProgress = eloNeeded === 0 ? 100 : Math.min(100, (elo / nextRank.minElo) * 100);
    const xpProgress = xpNeeded === 0 ? 100 : Math.min(100, (totalXP / nextRank.minXP) * 100);

    return {
        currentRank,
        nextRank,
        eloProgress: Math.round(eloProgress),
        xpProgress: Math.round(xpProgress),
        eloNeeded,
        xpNeeded,
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
        const rank = calculateRank(player.eloRating, player.xp);
        grouped[rank.id].push({
            ...player,
            rank
        });
    });

    return grouped;
}
