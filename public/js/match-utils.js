// Match-Utilities für Satz-Formatierung und Sieger-Bestimmung

export function formatMatchSets(sets, options = {}) {
    const {
        playerAKey = 'playerA',
        playerBKey = 'playerB',
        showRatio = true,
        noResultText = 'Kein Ergebnis',
    } = options;

    if (!sets || sets.length === 0) {
        return noResultText;
    }

    const setsStr = sets.map(s => `${s[playerAKey]}:${s[playerBKey]}`).join(', ');

    if (showRatio) {
        const winsA = sets.filter(s => s[playerAKey] > s[playerBKey] && s[playerAKey] >= 11).length;
        const winsB = sets.filter(s => s[playerBKey] > s[playerAKey] && s[playerBKey] >= 11).length;
        return `${winsA}:${winsB} (${setsStr})`;
    }

    return setsStr;
}

export function formatDoublesSets(sets) {
    return formatMatchSets(sets, {
        playerAKey: 'teamA',
        playerBKey: 'teamB',
    });
}

export function determineWinner(
    sets,
    matchMode = 'best-of-5',
    playerAKey = 'playerA',
    playerBKey = 'playerB'
) {
    if (!sets || sets.length === 0) {
        return null;
    }

    const setsToWin =
        {
            'single-set': 1,
            'best-of-3': 2,
            'best-of-5': 3,
            'best-of-7': 4,
        }[matchMode] || 3;

    const winsA = sets.filter(s => s[playerAKey] > s[playerBKey] && s[playerAKey] >= 11).length;
    const winsB = sets.filter(s => s[playerBKey] > s[playerAKey] && s[playerBKey] >= 11).length;

    if (winsA >= setsToWin) return 'A';
    if (winsB >= setsToWin) return 'B';
    return null;
}

export function getWinnerDisplay(sets, playerA, playerB, matchMode = 'best-of-5') {
    const winner = determineWinner(sets, matchMode);

    if (winner === 'A') {
        return playerA?.firstName || 'Spieler A';
    }
    if (winner === 'B') {
        return playerB?.firstName || 'Spieler B';
    }

    return 'Unentschieden';
}

export function formatSetsSimple(sets) {
    return formatMatchSets(sets, { showRatio: false });
}

export function getDoublesTeamName(match, winningTeam) {
    if (winningTeam === 'A') {
        const p1 = match.teamAPlayer1?.firstName || 'Spieler 1';
        const p2 = match.teamAPlayer2?.firstName || 'Spieler 2';
        return `${p1} & ${p2}`;
    } else {
        const p1 = match.teamBPlayer1?.firstName || 'Spieler 3';
        const p2 = match.teamBPlayer2?.firstName || 'Spieler 4';
        return `${p1} & ${p2}`;
    }
}
