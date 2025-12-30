// XP-Tracker (Firebase-Version)
// XP ist permanent und wird nie zurückgesetzt (anders als saisonale Punkte)

import {
    doc,
    updateDoc,
    increment,
    serverTimestamp,
    collection,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

export const XP_VALUES = {
    ATTENDANCE_BASE: 10,
    ATTENDANCE_STREAK_3: 15,
    ATTENDANCE_STREAK_5: 20,
    MATCH_PARTICIPATION: 10,
    MATCH_WIN_BASE: 25,
    EXERCISE_BASE: 30,
    CHALLENGE_MIN: 5,
    CHALLENGE_MAX: 100,
};

export async function awardXP(playerId, xpAmount, reason, db, awardedBy = 'System') {
    if (!playerId || !xpAmount || xpAmount <= 0) {
        console.warn('Ungültiger XP-Vergabe-Versuch:', { playerId, xpAmount, reason });
        return;
    }

    try {
        const playerRef = doc(db, 'users', playerId);

        await updateDoc(playerRef, {
            xp: increment(xpAmount),
            lastXPUpdate: serverTimestamp(),
        });

        const xpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
        await updateDoc(xpHistoryRef, {
            xp: xpAmount,
            reason,
            timestamp: serverTimestamp(),
            awardedBy,
        });

        console.log(`${xpAmount} XP vergeben an ${playerId}: ${reason}`);
    } catch (error) {
        console.error('XP-Vergabe fehlgeschlagen:', error);
    }
}

export async function awardAttendanceXP(playerId, streak, db) {
    let xp = XP_VALUES.ATTENDANCE_BASE;
    let reason = 'Anwesenheit beim Training';

    if (streak >= 5) {
        xp = XP_VALUES.ATTENDANCE_STREAK_5;
        reason = `Anwesenheit (${streak}x Super-Streak)`;
    } else if (streak >= 3) {
        xp = XP_VALUES.ATTENDANCE_STREAK_3;
        reason = `Anwesenheit (${streak}x Streak-Bonus)`;
    }

    await awardXP(playerId, xp, reason, db, 'System (Anwesenheit)');
    return xp;
}

export async function awardMatchXP(playerId, pointsAwarded, isHandicap, db) {
    const xp = XP_VALUES.MATCH_PARTICIPATION + pointsAwarded;
    const reason = isHandicap
        ? `Handicap-Wettkampf gewonnen (+${pointsAwarded} Punkte)`
        : `Wettkampf gewonnen (+${pointsAwarded} Punkte)`;

    await awardXP(playerId, xp, reason, db, 'System (Wettkampf)');
    return xp;
}

export async function awardExerciseXP(
    playerId,
    exerciseTitle,
    exercisePoints,
    db,
    awardedBy = 'Coach'
) {
    const xp = exercisePoints;
    const reason = `Übung abgeschlossen: ${exerciseTitle}`;

    await awardXP(playerId, xp, reason, db, awardedBy);
    return xp;
}

export async function awardChallengeXP(
    playerId,
    challengeTitle,
    challengePoints,
    db,
    awardedBy = 'Coach'
) {
    const xp = challengePoints;
    const reason = `Challenge abgeschlossen: ${challengeTitle}`;

    await awardXP(playerId, xp, reason, db, awardedBy);
    return xp;
}

export async function awardManualXP(playerId, xpAmount, reason, db, awardedBy) {
    await awardXP(playerId, xpAmount, reason, db, awardedBy);
    return xpAmount;
}

export function getPlayerXPInfo(userData) {
    const xp = userData.xp || 0;
    const eloRating = userData.eloRating || 0;

    return {
        xp,
        eloRating,
    };
}
