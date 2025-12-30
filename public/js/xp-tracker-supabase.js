// XP-Tracker (Supabase-Version)
// XP ist permanent und wird nie zurückgesetzt (anders als saisonale Punkte)

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

export async function awardXP(playerId, xpAmount, reason, supabase, awardedBy = 'System') {
    if (!playerId || !xpAmount || xpAmount <= 0) {
        console.warn('Ungültiger XP-Vergabe-Versuch:', { playerId, xpAmount, reason });
        return;
    }

    try {
        const { data: playerData, error: fetchError } = await supabase
            .from('profiles')
            .select('xp')
            .eq('id', playerId)
            .single();

        if (fetchError) throw fetchError;

        const currentXP = playerData?.xp || 0;
        const newXP = currentXP + xpAmount;

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                xp: newXP,
                last_xp_update: new Date().toISOString(),
            })
            .eq('id', playerId);

        if (updateError) throw updateError;

        const { error: historyError } = await supabase
            .from('xp_history')
            .insert({
                player_id: playerId,
                xp: xpAmount,
                reason,
                timestamp: new Date().toISOString(),
                awarded_by: awardedBy,
            });

        if (historyError) {
            console.warn('XP-Historie konnte nicht gespeichert werden:', historyError);
        }

        console.log(`${xpAmount} XP vergeben an ${playerId}: ${reason}`);
    } catch (error) {
        console.error('XP-Vergabe fehlgeschlagen:', error);
    }
}

export async function awardAttendanceXP(playerId, streak, supabase) {
    let xp = XP_VALUES.ATTENDANCE_BASE;
    let reason = 'Anwesenheit beim Training';

    if (streak >= 5) {
        xp = XP_VALUES.ATTENDANCE_STREAK_5;
        reason = `Anwesenheit (${streak}x Super-Streak)`;
    } else if (streak >= 3) {
        xp = XP_VALUES.ATTENDANCE_STREAK_3;
        reason = `Anwesenheit (${streak}x Streak-Bonus)`;
    }

    await awardXP(playerId, xp, reason, supabase, 'System (Anwesenheit)');
    return xp;
}

export async function awardMatchXP(playerId, pointsAwarded, isHandicap, supabase) {
    const xp = XP_VALUES.MATCH_PARTICIPATION + pointsAwarded;
    const reason = isHandicap
        ? `Handicap-Wettkampf gewonnen (+${pointsAwarded} Punkte)`
        : `Wettkampf gewonnen (+${pointsAwarded} Punkte)`;

    await awardXP(playerId, xp, reason, supabase, 'System (Wettkampf)');
    return xp;
}

export async function awardExerciseXP(
    playerId,
    exerciseTitle,
    exercisePoints,
    supabase,
    awardedBy = 'Coach'
) {
    const xp = exercisePoints;
    const reason = `Übung abgeschlossen: ${exerciseTitle}`;

    await awardXP(playerId, xp, reason, supabase, awardedBy);
    return xp;
}

export async function awardChallengeXP(
    playerId,
    challengeTitle,
    challengePoints,
    supabase,
    awardedBy = 'Coach'
) {
    const xp = challengePoints;
    const reason = `Challenge abgeschlossen: ${challengeTitle}`;

    await awardXP(playerId, xp, reason, supabase, awardedBy);
    return xp;
}

export async function awardManualXP(playerId, xpAmount, reason, supabase, awardedBy) {
    await awardXP(playerId, xpAmount, reason, supabase, awardedBy);
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
