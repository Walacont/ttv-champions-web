// Rang-System basierend auf Elo + XP
// Elo startet bei 800, XP-Schwellenwerte reduziert für schnelleren Fortschritt

export const RANKS = {
    REKRUT: {
        id: 0,
        name: 'Rekrut',
        emoji: '🔰',
        color: '#9CA3AF',
        minElo: 800,
        minXP: 0,
        description: 'Willkommen! Absolviere 5 Grundlagen-Übungen.',
        isOnboarding: true,
        requiresGrundlagen: false,
    },
    BRONZE: {
        id: 1,
        name: 'Bronze',
        emoji: '🥉',
        color: '#CD7F32',
        minElo: 850,
        minXP: 50,
        description: 'Du hast die Grundlagen gemeistert!',
        requiresGrundlagen: true,
        grundlagenRequired: 5,
    },
    SILBER: {
        id: 2,
        name: 'Silber',
        emoji: '🥈',
        color: '#C0C0C0',
        minElo: 1000,
        minXP: 200,
        description: 'Du bist auf dem besten Weg!',
        requiresGrundlagen: false,
    },
    GOLD: {
        id: 3,
        name: 'Gold',
        emoji: '🥇',
        color: '#FFD700',
        minElo: 1200,
        minXP: 500,
        description: 'Ein echter Champion!',
        requiresGrundlagen: false,
    },
    PLATIN: {
        id: 4,
        name: 'Platin',
        emoji: '💎',
        color: '#E5E4E2',
        minElo: 1400,
        minXP: 1000,
        description: 'Du gehörst zur Elite!',
        requiresGrundlagen: false,
    },
    CHAMPION: {
        id: 5,
        name: 'Champion',
        emoji: '👑',
        color: '#9333EA',
        minElo: 1600,
        minXP: 1800,
        description: 'Der höchste Rang - du bist ein Vereinsmeister!',
        requiresGrundlagen: false,
    },
};

export const RANK_ORDER = [
    RANKS.REKRUT,
    RANKS.BRONZE,
    RANKS.SILBER,
    RANKS.GOLD,
    RANKS.PLATIN,
    RANKS.CHAMPION,
];

export function calculateRank(eloRating, xp, grundlagenCount = 0) {
    const elo = eloRating ?? 800;
    const totalXP = xp || 0;

    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];
        const meetsBasicRequirements = elo >= rank.minElo && totalXP >= rank.minXP;

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

    return RANKS.REKRUT;
}

export function getRankProgress(eloRating, xp, grundlagenCount = 0) {
    const currentRank = calculateRank(eloRating, xp, grundlagenCount);
    const currentIndex = RANK_ORDER.findIndex(r => r.id === currentRank.id);

    if (currentIndex === RANK_ORDER.length - 1) {
        return {
            currentRank,
            nextRank: null,
            eloProgress: 100,
            xpProgress: 100,
            eloNeeded: 0,
            xpNeeded: 0,
            grundlagenNeeded: 0,
            isMaxRank: true,
        };
    }

    const nextRank = RANK_ORDER[currentIndex + 1];
    const elo = eloRating || 0;
    const totalXP = xp || 0;

    const eloNeeded = Math.max(0, nextRank.minElo - elo);
    const xpNeeded = Math.max(0, nextRank.minXP - totalXP);
    const grundlagenRequired = nextRank.grundlagenRequired || 5;
    const grundlagenNeeded = nextRank.requiresGrundlagen
        ? Math.max(0, grundlagenRequired - grundlagenCount)
        : 0;

    const eloProgress =
        nextRank.minElo === 0 ? (elo > 0 ? 100 : 0) : Math.min(100, (elo / nextRank.minElo) * 100);
    const xpProgress =
        nextRank.minXP === 0
            ? totalXP > 0
                ? 100
                : 0
            : Math.min(100, (totalXP / nextRank.minXP) * 100);
    const grundlagenProgress = nextRank.requiresGrundlagen
        ? Math.min(100, (grundlagenCount / grundlagenRequired) * 100)
        : 100;

    return {
        currentRank,
        nextRank,
        eloProgress: Math.round(eloProgress),
        xpProgress: Math.round(xpProgress),
        grundlagenProgress: Math.round(grundlagenProgress),
        eloNeeded,
        xpNeeded,
        grundlagenNeeded,
        isMaxRank: false,
    };
}

export function getRankById(rankId) {
    return RANK_ORDER.find(r => r.id === rankId) || null;
}

export function getRankByName(rankName) {
    const upperName = rankName.toUpperCase();
    return RANKS[upperName] || null;
}

export function formatRank(rank) {
    if (!rank) return '🎖️ Rekrut';
    return `${rank.emoji} ${rank.name}`;
}

export function groupPlayersByRank(players) {
    const grouped = {};

    RANK_ORDER.forEach(rank => {
        grouped[rank.id] = [];
    });

    players.forEach(player => {
        const playerWithGrundlagen = {
            ...player,
            grundlagenCompleted: player.grundlagenCompleted || 0,
        };

        const rank = calculateRank(
            playerWithGrundlagen.eloRating,
            playerWithGrundlagen.xp,
            playerWithGrundlagen.grundlagenCompleted
        );

        grouped[rank.id].push({
            ...playerWithGrundlagen,
            rank,
        });
    });

    return grouped;
}
