// Validierungs-Utilities für Match-Daten (ohne Firebase-Abhängigkeiten)

/** Validiert einen Satz nach offiziellen Tischtennis-Regeln */
export function isValidSet(scoreA, scoreB) {
    const a = parseInt(scoreA) || 0;
    const b = parseInt(scoreB) || 0;

    // Mindestens eine Seite muss 11+ Punkte haben
    if (a < 11 && b < 11) return false;

    if (a === b) return false;

    if (a >= 10 && b >= 10) {
        // Ab 10:10 genau 2 Punkte Vorsprung erforderlich
        return Math.abs(a - b) === 2;
    }

    return (a >= 11 && a > b) || (b >= 11 && b > a);
}

/** Ermittelt den Gewinner eines Satzes */
export function getSetWinner(scoreA, scoreB) {
    if (!isValidSet(scoreA, scoreB)) return null;

    const a = parseInt(scoreA) || 0;
    const b = parseInt(scoreB) || 0;

    if (a > b) return 'A';
    if (b > a) return 'B';
    return null;
}

/** Validiert ein vollständiges Match (alle Sätze) */
export function validateMatch(sets) {
    const minSets = 3;

    if (!sets || sets.length < minSets) {
        return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
    }

    // Jeden Satz nach offiziellen Tischtennis-Regeln validieren
    for (let i = 0; i < sets.length; i++) {
        const set = sets[i];
        const scoreA = parseInt(set.playerA) || 0;
        const scoreB = parseInt(set.playerB) || 0;

        if (!isValidSet(scoreA, scoreB)) {
            if (scoreA < 11 && scoreB < 11) {
                return {
                    valid: false,
                    error: `Satz ${i + 1}: Mindestens eine Seite muss 11 Punkte haben.`,
                };
            }
            if (scoreA === scoreB) {
                return { valid: false, error: `Satz ${i + 1}: Unentschieden ist nicht erlaubt.` };
            }
            if (scoreA >= 10 && scoreB >= 10 && Math.abs(scoreA - scoreB) !== 2) {
                return {
                    valid: false,
                    error: `Satz ${i + 1}: Ab 10:10 muss eine Seite 2 Punkte Vorsprung haben (z.B. 12:10, 14:12).`,
                };
            }
            return {
                valid: false,
                error: `Satz ${i + 1}: Ungültiges Satzergebnis (${scoreA}:${scoreB}).`,
            };
        }
    }

    let playerAWins = 0;
    let playerBWins = 0;

    sets.forEach(set => {
        const winner = getSetWinner(set.playerA, set.playerB);
        if (winner === 'A') playerAWins++;
        if (winner === 'B') playerBWins++;
    });

    if (playerAWins < 3 && playerBWins < 3) {
        return { valid: false, error: 'Ein Spieler muss 3 Sätze gewinnen.' };
    }

    const winner = playerAWins >= 3 ? 'A' : 'B';

    return { valid: true, winner };
}

// Handicap-Konfiguration pro Sportart
const HANDICAP_CONFIG = {
    'table_tennis': { threshold: 40, pointsPer: 40, maxPoints: 7, unit: 'Punkte' },
    'tischtennis': { threshold: 40, pointsPer: 40, maxPoints: 7, unit: 'Punkte' },
    'badminton': { threshold: 40, pointsPer: 40, maxPoints: 12, unit: 'Punkte' },
    'padel': { threshold: 150, pointsPer: 150, maxPoints: 3, unit: 'Games' },
    'tennis': { threshold: 150, pointsPer: 150, maxPoints: 3, unit: 'Games' },
    'default': { threshold: 40, pointsPer: 40, maxPoints: 7, unit: 'Punkte' }
};

/** Berechnet Handicap-Punkte basierend auf Elo-Unterschied und Sportart */
export function calculateHandicap(playerA, playerB, sportName = 'table_tennis') {
    const eloA = playerA.eloRating || playerA.elo_rating || 0;
    const eloB = playerB.eloRating || playerB.elo_rating || 0;
    const eloDiff = Math.abs(eloA - eloB);

    const config = HANDICAP_CONFIG[sportName?.toLowerCase()] || HANDICAP_CONFIG['default'];

    if (eloDiff < config.threshold) {
        return null;
    }

    let handicapPoints = Math.floor(eloDiff / config.pointsPer);

    if (handicapPoints > config.maxPoints) {
        handicapPoints = config.maxPoints;
    }

    if (handicapPoints < 1) {
        return null;
    }

    const weakerPlayer = eloA < eloB ? playerA : playerB;
    return {
        player: weakerPlayer,
        points: handicapPoints,
        unit: config.unit,
        eloDiff: eloDiff
    };
}

/** Berechnet Handicap-Punkte für Doppel basierend auf durchschnittlichem Team-Elo */
export function calculateDoublesHandicap(teamA, teamB, sportName = 'table_tennis') {
    const eloA1 = teamA.player1?.eloRating || teamA.player1?.elo_rating || 0;
    const eloA2 = teamA.player2?.eloRating || teamA.player2?.elo_rating || 0;
    const eloB1 = teamB.player1?.eloRating || teamB.player1?.elo_rating || 0;
    const eloB2 = teamB.player2?.eloRating || teamB.player2?.elo_rating || 0;

    const averageEloA = (eloA1 + eloA2) / 2;
    const averageEloB = (eloB1 + eloB2) / 2;

    const eloDiff = Math.abs(averageEloA - averageEloB);

    const config = HANDICAP_CONFIG[sportName?.toLowerCase()] || HANDICAP_CONFIG['default'];

    if (eloDiff < config.threshold) {
        return null;
    }

    let handicapPoints = Math.floor(eloDiff / config.pointsPer);

    if (handicapPoints > config.maxPoints) {
        handicapPoints = config.maxPoints;
    }

    if (handicapPoints < 1) {
        return null;
    }

    const weakerTeam = averageEloA < averageEloB ? 'A' : 'B';
    return {
        team: weakerTeam,
        averageEloA: Math.round(averageEloA),
        averageEloB: Math.round(averageEloB),
        points: handicapPoints,
        unit: config.unit,
        eloDiff: Math.round(eloDiff)
    };
}
