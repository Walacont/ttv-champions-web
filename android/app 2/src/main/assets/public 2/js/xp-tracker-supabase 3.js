/**
 * XP Tracker Module (Supabase Version)
 * Handles all XP (Experience Points) updates for the new rank system
 * XP is permanent and never resets (unlike seasonal points)
 */

/**
 * XP values for different activities
 * These match the current point system but are tracked separately as XP
 */
export const XP_VALUES = {
    ATTENDANCE_BASE: 10, // Base XP for showing up
    ATTENDANCE_STREAK_3: 15, // Bonus for 3+ day streak
    ATTENDANCE_STREAK_5: 20, // Bonus for 5+ day streak
    MATCH_PARTICIPATION: 10, // Just for playing a match
    MATCH_WIN_BASE: 25, // Base bonus for winning
    EXERCISE_BASE: 30, // Average exercise XP (will use actual exercise points)
    CHALLENGE_MIN: 5, // Minimum challenge XP
    CHALLENGE_MAX: 100, // Maximum challenge XP
};

/**
 * Award XP to a player and log it in history
 * @param {string} playerId - Player's user ID
 * @param {number} xpAmount - Amount of XP to award
 * @param {string} reason - Reason for XP award
 * @param {Object} supabase - Supabase client instance
 * @param {string} awardedBy - Who awarded the XP (default: "System")
 */
export async function awardXP(playerId, xpAmount, reason, supabase, awardedBy = 'System') {
    if (!playerId || !xpAmount || xpAmount <= 0) {
        console.warn('Invalid XP award attempt:', { playerId, xpAmount, reason });
        return;
    }

    try {
        // Get current player data
        const { data: playerData, error: fetchError } = await supabase
            .from('profiles')
            .select('xp')
            .eq('id', playerId)
            .single();

        if (fetchError) throw fetchError;

        const currentXP = playerData?.xp || 0;
        const newXP = currentXP + xpAmount;

        // Update player's total XP
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                xp: newXP,
                last_xp_update: new Date().toISOString(),
            })
            .eq('id', playerId);

        if (updateError) throw updateError;

        // Log XP in history
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
            console.warn('Failed to log XP history:', historyError);
        }

        console.log(`✅ Awarded ${xpAmount} XP to ${playerId}: ${reason}`);
    } catch (error) {
        console.error('Failed to award XP:', error);
    }
}

/**
 * Award XP for attendance (based on streak)
 * @param {string} playerId - Player's user ID
 * @param {number} streak - Current attendance streak
 * @param {Object} supabase - Supabase client instance
 * @returns {number} XP awarded
 */
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

/**
 * Award XP for winning a match
 * The XP amount matches the points awarded (eloDelta-based or handicap)
 * @param {string} playerId - Player's user ID
 * @param {number} pointsAwarded - Points awarded for the match
 * @param {boolean} isHandicap - Whether it was a handicap match
 * @param {Object} supabase - Supabase client instance
 */
export async function awardMatchXP(playerId, pointsAwarded, isHandicap, supabase) {
    // Match XP = participation + win bonus (matches current point system)
    const xp = XP_VALUES.MATCH_PARTICIPATION + pointsAwarded;
    const reason = isHandicap
        ? `Handicap-Wettkampf gewonnen (+${pointsAwarded} Punkte)`
        : `Wettkampf gewonnen (+${pointsAwarded} Punkte)`;

    await awardXP(playerId, xp, reason, supabase, 'System (Wettkampf)');
    return xp;
}

/**
 * Award XP for completing an exercise
 * @param {string} playerId - Player's user ID
 * @param {string} exerciseTitle - Title of the exercise
 * @param {number} exercisePoints - Points awarded by the exercise
 * @param {Object} supabase - Supabase client instance
 * @param {string} awardedBy - Who awarded it (coach name)
 */
export async function awardExerciseXP(
    playerId,
    exerciseTitle,
    exercisePoints,
    supabase,
    awardedBy = 'Coach'
) {
    // Exercise XP = exercise points (they're already well-balanced)
    const xp = exercisePoints;
    const reason = `Übung abgeschlossen: ${exerciseTitle}`;

    await awardXP(playerId, xp, reason, supabase, awardedBy);
    return xp;
}

/**
 * Award XP for completing a challenge
 * @param {string} playerId - Player's user ID
 * @param {string} challengeTitle - Title of the challenge
 * @param {number} challengePoints - Points awarded by the challenge
 * @param {Object} supabase - Supabase client instance
 * @param {string} awardedBy - Who awarded it (coach name)
 */
export async function awardChallengeXP(
    playerId,
    challengeTitle,
    challengePoints,
    supabase,
    awardedBy = 'Coach'
) {
    // Challenge XP = challenge points
    const xp = challengePoints;
    const reason = `Challenge abgeschlossen: ${challengeTitle}`;

    await awardXP(playerId, xp, reason, supabase, awardedBy);
    return xp;
}

/**
 * Award manual XP (for special occasions or corrections)
 * @param {string} playerId - Player's user ID
 * @param {number} xpAmount - Amount of XP to award
 * @param {string} reason - Reason for manual XP
 * @param {Object} supabase - Supabase client instance
 * @param {string} awardedBy - Who awarded it
 */
export async function awardManualXP(playerId, xpAmount, reason, supabase, awardedBy) {
    await awardXP(playerId, xpAmount, reason, supabase, awardedBy);
    return xpAmount;
}

/**
 * Get player's current XP and rank
 * @param {Object} userData - User data object
 * @returns {Object} { xp, rank, progress }
 */
export function getPlayerXPInfo(userData) {
    const xp = userData.xp || 0;
    const eloRating = userData.eloRating || 0;

    return {
        xp,
        eloRating,
        // We'll need to import ranks.js to calculate rank
        // For now, just return the raw values
    };
}
