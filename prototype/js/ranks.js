/**
 * Rang-System für SC Champions Prototyp
 * Schwellenwerte nach Bachelorarbeit
 */

// Rang-Definitionen mit XP und Elo-Anforderungen
export const RANKS = {
    REKRUT: {
        id: 'rekrut',
        name: 'Rekrut',
        minElo: 800,
        minXP: 0,
        color: '#6B7280',      // Grau
        bgColor: '#F3F4F6',
        emoji: '🔰',
        description: 'Startrang - Schließe 5 Grundlagen-Übungen ab, um Wettkampfspiele zu spielen.'
    },
    BRONZE: {
        id: 'bronze',
        name: 'Bronze',
        minElo: 850,
        minXP: 50,
        color: '#CD7F32',      // Bronze
        bgColor: '#FEF3C7',
        emoji: '🥉',
        description: 'Du hast die Grundlagen gemeistert.'
    },
    SILBER: {
        id: 'silber',
        name: 'Silber',
        minElo: 900,
        minXP: 200,
        color: '#C0C0C0',      // Silber
        bgColor: '#F3F4F6',
        emoji: '🥈',
        description: 'Ein solider Spieler mit Erfahrung.'
    },
    GOLD: {
        id: 'gold',
        name: 'Gold',
        minElo: 1000,
        minXP: 500,
        color: '#FFD700',      // Gold
        bgColor: '#FEF9C3',
        emoji: '🥇',
        description: 'Ein starker Spieler mit Engagement.'
    },
    PLATIN: {
        id: 'platin',
        name: 'Platin',
        minElo: 1100,
        minXP: 1000,
        color: '#E5E4E2',      // Platin
        bgColor: '#F0FDFA',
        emoji: '💎',
        description: 'Elite-Spieler mit konstanter Leistung.'
    },
    CHAMPION: {
        id: 'champion',
        name: 'Champion',
        minElo: 1300,
        minXP: 1800,
        color: '#9333EA',      // Lila
        bgColor: '#F3E8FF',
        emoji: '👑',
        description: 'Höchster Rang - Du bist ein Vereinsmeister!'
    }
};

// Rang-Reihenfolge (aufsteigend)
export const RANK_ORDER = ['REKRUT', 'BRONZE', 'SILBER', 'GOLD', 'PLATIN', 'CHAMPION'];

// Mindestanzahl Grundlagen-Übungen für Rekrut-Aufstieg
export const GRUNDLAGEN_REQUIRED = 5;

/**
 * Berechnet den aktuellen Rang eines Spielers
 * @param {number} eloRating - Aktuelle Elo-Wertung
 * @param {number} xp - Aktuelle XP
 * @param {number} grundlagenCompleted - Anzahl abgeschlossener Grundlagen-Übungen
 * @returns {Object} Rang-Objekt
 */
export function calculateRank(eloRating, xp, grundlagenCompleted = 0) {
    // Rekrut bleibt Rekrut, bis 5 Grundlagen abgeschlossen sind
    if (grundlagenCompleted < GRUNDLAGEN_REQUIRED) {
        return RANKS.REKRUT;
    }

    // Prüfe Ränge von oben nach unten
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rankKey = RANK_ORDER[i];
        const rank = RANKS[rankKey];

        // Beide Bedingungen müssen erfüllt sein
        if (eloRating >= rank.minElo && xp >= rank.minXP) {
            return rank;
        }
    }

    // Fallback auf Rekrut
    return RANKS.REKRUT;
}

/**
 * Berechnet den Fortschritt zum nächsten Rang
 * @param {number} eloRating - Aktuelle Elo-Wertung
 * @param {number} xp - Aktuelle XP
 * @param {number} grundlagenCompleted - Anzahl abgeschlossener Grundlagen-Übungen
 * @returns {Object} Fortschrittsdaten
 */
export function getRankProgress(eloRating, xp, grundlagenCompleted = 0) {
    const currentRank = calculateRank(eloRating, xp, grundlagenCompleted);
    const currentIndex = RANK_ORDER.indexOf(
        Object.keys(RANKS).find(key => RANKS[key].id === currentRank.id)
    );

    // Sonderfall: Rekrut ohne genug Grundlagen
    if (grundlagenCompleted < GRUNDLAGEN_REQUIRED) {
        return {
            currentRank,
            nextRank: RANKS.BRONZE,
            isMaxRank: false,
            requirements: {
                grundlagen: {
                    current: grundlagenCompleted,
                    required: GRUNDLAGEN_REQUIRED,
                    progress: (grundlagenCompleted / GRUNDLAGEN_REQUIRED) * 100,
                    fulfilled: false
                },
                elo: {
                    current: eloRating,
                    required: RANKS.BRONZE.minElo,
                    progress: Math.min(100, ((eloRating - 800) / (RANKS.BRONZE.minElo - 800)) * 100),
                    fulfilled: eloRating >= RANKS.BRONZE.minElo,
                    needed: Math.max(0, RANKS.BRONZE.minElo - eloRating)
                },
                xp: {
                    current: xp,
                    required: RANKS.BRONZE.minXP,
                    progress: Math.min(100, (xp / RANKS.BRONZE.minXP) * 100),
                    fulfilled: xp >= RANKS.BRONZE.minXP,
                    needed: Math.max(0, RANKS.BRONZE.minXP - xp)
                }
            },
            message: `Schließe noch ${GRUNDLAGEN_REQUIRED - grundlagenCompleted} Grundlagen-Übung(en) ab.`
        };
    }

    // Champion ist bereits erreicht
    if (currentIndex === RANK_ORDER.length - 1) {
        return {
            currentRank,
            nextRank: null,
            isMaxRank: true,
            requirements: null,
            message: 'Du hast den höchsten Rang erreicht!'
        };
    }

    // Nächster Rang
    const nextRankKey = RANK_ORDER[currentIndex + 1];
    const nextRank = RANKS[nextRankKey];

    // Fortschritt berechnen
    const eloProgress = currentRank.minElo === nextRank.minElo
        ? 100
        : Math.min(100, ((eloRating - currentRank.minElo) / (nextRank.minElo - currentRank.minElo)) * 100);

    const xpProgress = currentRank.minXP === nextRank.minXP
        ? 100
        : Math.min(100, ((xp - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100);

    const eloNeeded = Math.max(0, nextRank.minElo - eloRating);
    const xpNeeded = Math.max(0, nextRank.minXP - xp);

    // Nachricht erstellen
    let message = '';
    if (eloNeeded > 0 && xpNeeded > 0) {
        message = `Noch ${eloNeeded} Elo und ${xpNeeded} XP bis ${nextRank.name}.`;
    } else if (eloNeeded > 0) {
        message = `Noch ${eloNeeded} Elo bis ${nextRank.name}. XP-Anforderung erfüllt!`;
    } else if (xpNeeded > 0) {
        message = `Noch ${xpNeeded} XP bis ${nextRank.name}. Elo-Anforderung erfüllt!`;
    }

    return {
        currentRank,
        nextRank,
        isMaxRank: false,
        requirements: {
            elo: {
                current: eloRating,
                required: nextRank.minElo,
                progress: eloProgress,
                fulfilled: eloRating >= nextRank.minElo,
                needed: eloNeeded
            },
            xp: {
                current: xp,
                required: nextRank.minXP,
                progress: xpProgress,
                fulfilled: xp >= nextRank.minXP,
                needed: xpNeeded
            }
        },
        message
    };
}

/**
 * Findet den nächsten Rivalen in einer Rangliste
 * @param {Array} players - Sortierte Spielerliste
 * @param {string} currentPlayerId - ID des aktuellen Spielers
 * @returns {Object|null} Rivale oder null
 */
export function findNextRival(players, currentPlayerId) {
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);

    if (currentIndex === -1 || currentIndex === 0) {
        return null;  // Spieler nicht gefunden oder bereits auf Platz 1
    }

    const rival = players[currentIndex - 1];
    return {
        player: rival,
        position: currentIndex,  // 0-basiert, also Position des Rivalen
        difference: {
            elo: rival.elo_rating - players[currentIndex].elo_rating,
            xp: rival.xp - players[currentIndex].xp,
            seasonPoints: rival.season_points - players[currentIndex].season_points
        }
    };
}

/**
 * Gruppiert Spieler nach Rang
 * @param {Array} players - Spielerliste
 * @returns {Object} Spieler gruppiert nach Rang
 */
export function groupByRank(players) {
    const groups = {};

    // Initialisiere alle Ränge
    RANK_ORDER.forEach(rankKey => {
        groups[rankKey] = {
            rank: RANKS[rankKey],
            players: []
        };
    });

    // Spieler zuordnen
    players.forEach(player => {
        const rank = calculateRank(
            player.elo_rating,
            player.xp,
            player.grundlagen_completed || 0
        );

        const rankKey = Object.keys(RANKS).find(key => RANKS[key].id === rank.id);
        if (rankKey && groups[rankKey]) {
            groups[rankKey].players.push(player);
        }
    });

    return groups;
}

/**
 * Erstellt HTML für Rang-Badge
 * @param {Object} rank - Rang-Objekt
 * @param {string} size - 'sm', 'md', 'lg'
 * @returns {string} HTML-String
 */
export function createRankBadge(rank, size = 'md') {
    const sizes = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-3 py-1',
        lg: 'text-base px-4 py-2'
    };

    return `
        <span class="inline-flex items-center gap-1 rounded-full font-medium ${sizes[size]}"
              style="background-color: ${rank.bgColor}; color: ${rank.color}; border: 1px solid ${rank.color};">
            <span>${rank.emoji}</span>
            <span>${rank.name}</span>
        </span>
    `;
}

/**
 * Erstellt HTML für Rang-Fortschrittsanzeige
 * @param {Object} progress - Fortschrittsdaten von getRankProgress()
 * @returns {string} HTML-String
 */
export function createRankProgressDisplay(progress) {
    if (progress.isMaxRank) {
        return `
            <div class="text-center p-4">
                <div class="text-4xl mb-2">${progress.currentRank.emoji}</div>
                <div class="text-xl font-bold" style="color: ${progress.currentRank.color};">
                    ${progress.currentRank.name}
                </div>
                <p class="text-gray-500 mt-2">${progress.message}</p>
            </div>
        `;
    }

    const { requirements } = progress;

    // Grundlagen-Fortschritt (nur für Rekrut)
    let grundlagenHtml = '';
    if (requirements.grundlagen) {
        grundlagenHtml = `
            <div class="mb-4">
                <div class="flex justify-between text-sm mb-1">
                    <span>Grundlagen-Übungen</span>
                    <span>${requirements.grundlagen.current}/${requirements.grundlagen.required}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="h-2 rounded-full transition-all"
                         style="width: ${requirements.grundlagen.progress}%; background-color: #10B981;"></div>
                </div>
            </div>
        `;
    }

    return `
        <div class="p-4">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <span class="text-2xl">${progress.currentRank.emoji}</span>
                    <span class="font-bold" style="color: ${progress.currentRank.color};">
                        ${progress.currentRank.name}
                    </span>
                </div>
                <span class="text-gray-400">→</span>
                <div class="flex items-center gap-2">
                    <span class="text-2xl">${progress.nextRank.emoji}</span>
                    <span class="font-bold" style="color: ${progress.nextRank.color};">
                        ${progress.nextRank.name}
                    </span>
                </div>
            </div>

            ${grundlagenHtml}

            <div class="space-y-3">
                <!-- Elo-Fortschritt -->
                <div>
                    <div class="flex justify-between text-sm mb-1">
                        <span>Elo-Wertung</span>
                        <span class="${requirements.elo.fulfilled ? 'text-green-600' : ''}">
                            ${requirements.elo.current}/${requirements.elo.required}
                            ${requirements.elo.fulfilled ? '✓' : ''}
                        </span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="h-2 rounded-full transition-all"
                             style="width: ${requirements.elo.progress}%; background-color: ${requirements.elo.fulfilled ? '#10B981' : '#3B82F6'};"></div>
                    </div>
                </div>

                <!-- XP-Fortschritt -->
                <div>
                    <div class="flex justify-between text-sm mb-1">
                        <span>Experience Points</span>
                        <span class="${requirements.xp.fulfilled ? 'text-green-600' : ''}">
                            ${requirements.xp.current}/${requirements.xp.required}
                            ${requirements.xp.fulfilled ? '✓' : ''}
                        </span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="h-2 rounded-full transition-all"
                             style="width: ${requirements.xp.progress}%; background-color: ${requirements.xp.fulfilled ? '#10B981' : '#8B5CF6'};"></div>
                    </div>
                </div>
            </div>

            <p class="text-sm text-gray-600 mt-4 text-center">${progress.message}</p>
        </div>
    `;
}
