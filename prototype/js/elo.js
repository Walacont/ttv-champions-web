/**
 * Elo-System für SC Champions Prototyp
 * Basierend auf dem QTTR-Verfahren des DTTB
 */

// Konstanten
export const ELO_START = 800;        // Startwert für neue Spieler
export const ELO_FLOOR = 400;        // Mindestwert
export const HANDICAP_THRESHOLD = 40; // Ab dieser Differenz wird Handicap vorgeschlagen
export const HANDICAP_STEP = 40;     // Elo-Differenz pro Handicap-Punkt
export const HANDICAP_MAX = 7;       // Maximale Handicap-Punkte
export const HANDICAP_ELO_CHANGE = 8; // Feste Elo-Änderung bei Handicap-Spielen

/**
 * Berechnet den A-Faktor (Volatilität) für einen Spieler
 * Nach QTTR-Verfahren des DTTB
 *
 * @param {number} matchesPlayed - Anzahl gespielter Spiele
 * @param {Date|string|null} birthdate - Geburtsdatum des Spielers
 * @returns {number} A-Faktor (16, 20, 24, oder 32)
 */
export function calculateAFactor(matchesPlayed, birthdate = null) {
    // Alter berechnen
    let age = 99;
    if (birthdate) {
        const birth = new Date(birthdate);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
    }

    // Jugendliche unter 21 haben immer Faktor 20
    if (age < 21) {
        return 20;
    }

    // Nach Spielanzahl
    if (matchesPlayed <= 10) {
        return 32;  // Initialisierung: Werte pendeln sich schnell ein
    } else if (matchesPlayed <= 20) {
        return 24;  // Stabilisierung
    } else {
        return 16;  // Etabliert
    }
}

/**
 * Berechnet die erwartete Gewinnwahrscheinlichkeit
 *
 * @param {number} playerElo - Elo des Spielers
 * @param {number} opponentElo - Elo des Gegners
 * @returns {number} Erwartungswert zwischen 0 und 1
 */
export function calculateExpectedScore(playerElo, opponentElo) {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Berechnet die Elo-Änderung nach einem Spiel
 *
 * @param {number} playerElo - Aktuelle Elo des Spielers
 * @param {number} opponentElo - Aktuelle Elo des Gegners
 * @param {boolean} playerWon - Hat der Spieler gewonnen?
 * @param {number} aFactor - A-Faktor des Spielers
 * @param {boolean} isHandicapMatch - War es ein Handicap-Spiel?
 * @returns {number} Elo-Änderung (positiv oder negativ)
 */
export function calculateEloChange(playerElo, opponentElo, playerWon, aFactor, isHandicapMatch = false) {
    // Bei Handicap-Match: fester Wert
    if (isHandicapMatch) {
        return playerWon ? HANDICAP_ELO_CHANGE : -HANDICAP_ELO_CHANGE;
    }

    // Normale Elo-Berechnung
    const expected = calculateExpectedScore(playerElo, opponentElo);
    const actual = playerWon ? 1 : 0;
    const change = aFactor * (actual - expected);

    return Math.round(change);
}

/**
 * Berechnet die neuen Elo-Werte nach einem Spiel
 *
 * @param {Object} playerA - Spieler A {elo_rating, singles_matches_played, birthdate}
 * @param {Object} playerB - Spieler B {elo_rating, singles_matches_played, birthdate}
 * @param {string} winnerId - ID des Gewinners ('A' oder 'B')
 * @param {boolean} isHandicapMatch - War es ein Handicap-Spiel?
 * @returns {Object} Neue Elo-Werte und Änderungen
 */
export function processMatch(playerA, playerB, winnerId, isHandicapMatch = false) {
    const aFactorA = calculateAFactor(playerA.singles_matches_played || 0, playerA.birthdate);
    const aFactorB = calculateAFactor(playerB.singles_matches_played || 0, playerB.birthdate);

    const playerAWon = winnerId === 'A';
    const playerBWon = winnerId === 'B';

    const changeA = calculateEloChange(
        playerA.elo_rating,
        playerB.elo_rating,
        playerAWon,
        aFactorA,
        isHandicapMatch
    );

    const changeB = calculateEloChange(
        playerB.elo_rating,
        playerA.elo_rating,
        playerBWon,
        aFactorB,
        isHandicapMatch
    );

    return {
        playerA: {
            eloBefore: playerA.elo_rating,
            eloAfter: Math.max(ELO_FLOOR, playerA.elo_rating + changeA),
            change: changeA,
            aFactor: aFactorA
        },
        playerB: {
            eloBefore: playerB.elo_rating,
            eloAfter: Math.max(ELO_FLOOR, playerB.elo_rating + changeB),
            change: changeB,
            aFactor: aFactorB
        },
        isHandicapMatch
    };
}

// ============================================
// HANDICAP-SYSTEM
// ============================================

/**
 * Berechnet Handicap basierend auf Elo-Differenz
 * Ab 40 Punkten Differenz wird Handicap vorgeschlagen
 *
 * @param {number} strongerElo - Elo des stärkeren Spielers
 * @param {number} weakerElo - Elo des schwächeren Spielers
 * @returns {number} Handicap-Punkte (0-7)
 */
export function calculateEloHandicap(strongerElo, weakerElo) {
    const difference = strongerElo - weakerElo;

    if (difference < HANDICAP_THRESHOLD) {
        return 0;
    }

    // Staffelung: 40-79 = 1, 80-119 = 2, 120-159 = 3, etc.
    const handicap = Math.floor(difference / HANDICAP_STEP);
    return Math.min(handicap, HANDICAP_MAX);
}

/**
 * Berechnet Handicap basierend auf direkter Bilanz
 * 2 Siege in Folge = 1 Punkt, 3 Siege = 2 Punkte, etc.
 *
 * @param {number} consecutiveWins - Anzahl Siege in Folge gegen denselben Gegner
 * @returns {number} Handicap-Punkte (0-7)
 */
export function calculateH2HHandicap(consecutiveWins) {
    if (consecutiveWins < 2) {
        return 0;
    }

    // 2 Siege = 1, 3 Siege = 2, etc.
    const handicap = consecutiveWins - 1;
    return Math.min(handicap, HANDICAP_MAX);
}

/**
 * Ermittelt das empfohlene Handicap zwischen zwei Spielern
 *
 * @param {Object} playerA - Spieler A {elo_rating}
 * @param {Object} playerB - Spieler B {elo_rating}
 * @param {Object|null} h2hStats - Head-to-Head Statistik {last_winner_id, consecutive_wins}
 * @returns {Object} Handicap-Empfehlung
 */
export function getHandicapRecommendation(playerA, playerB, h2hStats = null) {
    // Bestimme stärkeren/schwächeren Spieler
    const strongerPlayer = playerA.elo_rating >= playerB.elo_rating ? playerA : playerB;
    const weakerPlayer = playerA.elo_rating >= playerB.elo_rating ? playerB : playerA;
    const strongerIsA = playerA.elo_rating >= playerB.elo_rating;

    // Elo-basiertes Handicap
    const eloHandicap = calculateEloHandicap(strongerPlayer.elo_rating, weakerPlayer.elo_rating);

    // H2H-basiertes Handicap
    let h2hHandicap = 0;
    let h2hForWeaker = false;

    if (h2hStats && h2hStats.consecutive_wins >= 2) {
        h2hHandicap = calculateH2HHandicap(h2hStats.consecutive_wins);

        // Prüfen, ob der letzte Gewinner der stärkere Spieler ist
        const lastWinnerIsStronger =
            (strongerIsA && h2hStats.last_winner_id === playerA.id) ||
            (!strongerIsA && h2hStats.last_winner_id === playerB.id);

        // Handicap gilt für den Unterlegenen der Serie
        h2hForWeaker = lastWinnerIsStronger;
    }

    // Gesamthandicap: Höherer Wert zählt
    const totalHandicap = Math.max(eloHandicap, h2hHandicap);

    // Handicap gilt für den schwächeren Spieler
    const handicapForPlayer = weakerPlayer;

    return {
        recommended: totalHandicap > 0,
        handicapPoints: totalHandicap,
        forPlayer: handicapForPlayer,
        forPlayerIsA: !strongerIsA,
        breakdown: {
            eloHandicap,
            eloDifference: strongerPlayer.elo_rating - weakerPlayer.elo_rating,
            h2hHandicap,
            h2hConsecutiveWins: h2hStats?.consecutive_wins || 0
        },
        description: totalHandicap > 0
            ? `${handicapForPlayer.first_name || 'Schwächerer Spieler'} startet jeden Satz mit ${totalHandicap}:0 Vorsprung.`
            : 'Kein Handicap empfohlen.'
    };
}

/**
 * Aktualisiert das H2H-Handicap nach einem Sieg des Unterlegenen
 * Das Handicap reduziert sich um 1
 *
 * @param {number} currentHandicap - Aktuelles Handicap
 * @returns {number} Neues Handicap
 */
export function reduceH2HHandicap(currentHandicap) {
    return Math.max(0, currentHandicap - 1);
}

// ============================================
// DOPPEL-ELO
// ============================================

/**
 * Berechnet Doppel-Elo-Änderung
 * Jede Paarung hat ein eigenes Elo, das bei 800 startet
 *
 * @param {number} teamElo - Elo des Teams
 * @param {number} opponentTeamElo - Elo des gegnerischen Teams
 * @param {boolean} won - Hat das Team gewonnen?
 * @param {number} matchesPlayed - Anzahl gespielter Doppel des Teams
 * @returns {number} Elo-Änderung
 */
export function calculateDoublesEloChange(teamElo, opponentTeamElo, won, matchesPlayed = 0) {
    // Vereinfachter A-Faktor für Doppel
    let aFactor;
    if (matchesPlayed <= 5) {
        aFactor = 32;
    } else if (matchesPlayed <= 10) {
        aFactor = 24;
    } else {
        aFactor = 16;
    }

    const expected = calculateExpectedScore(teamElo, opponentTeamElo);
    const actual = won ? 1 : 0;
    const change = aFactor * (actual - expected);

    return Math.round(change);
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Formatiert eine Elo-Änderung für die Anzeige
 *
 * @param {number} change - Elo-Änderung
 * @returns {string} Formatierte Zeichenkette mit +/- und Farbe
 */
export function formatEloChange(change) {
    if (change > 0) {
        return `<span class="text-green-600">+${change}</span>`;
    } else if (change < 0) {
        return `<span class="text-red-600">${change}</span>`;
    } else {
        return `<span class="text-gray-500">±0</span>`;
    }
}

/**
 * Zeigt A-Faktor-Info an
 *
 * @param {number} aFactor - A-Faktor
 * @returns {string} Beschreibung
 */
export function getAFactorDescription(aFactor) {
    switch (aFactor) {
        case 32:
            return 'Initialisierung (Spiele 1-10)';
        case 24:
            return 'Stabilisierung (Spiele 11-20)';
        case 20:
            return 'Jugendlicher (unter 21)';
        case 16:
            return 'Etabliert (ab Spiel 21)';
        default:
            return `Faktor: ${aFactor}`;
    }
}

/**
 * Simuliert die erwartete Elo-Änderung für eine Vorschau
 *
 * @param {number} playerElo - Elo des Spielers
 * @param {number} opponentElo - Elo des Gegners
 * @param {number} aFactor - A-Faktor des Spielers
 * @param {boolean} isHandicap - Handicap-Spiel?
 * @returns {Object} Erwartete Änderungen bei Sieg/Niederlage
 */
export function previewEloChange(playerElo, opponentElo, aFactor, isHandicap = false) {
    return {
        onWin: calculateEloChange(playerElo, opponentElo, true, aFactor, isHandicap),
        onLoss: calculateEloChange(playerElo, opponentElo, false, aFactor, isHandicap),
        winProbability: Math.round(calculateExpectedScore(playerElo, opponentElo) * 100)
    };
}
