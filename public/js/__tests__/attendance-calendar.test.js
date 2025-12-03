/**
 * Unit Tests for Attendance & Calendar System
 *
 * Tests the new calendar system features:
 * - Multiple training sessions per day
 * - Half-points for 2nd+ training on same day
 * - Session-based attendance tracking
 * - Streak calculations across sessions
 * - Points calculation with streak bonuses
 */

import { describe, test, expect, beforeEach } from 'vitest';

// ============================================================================
// Helper Functions (Extracted from attendance.js logic)
// ============================================================================

const ATTENDANCE_POINTS_BASE = 3;

/**
 * Calculate points based on streak (extracted from attendance.js)
 * @param {number} streak - Current streak count
 * @returns {number} - Points to award (3, 5, or 6)
 */
function calculateStreakPoints(streak) {
    if (streak >= 5) {
        return 6; // 3 base + 3 bonus (Super-Streak)
    } else if (streak >= 3) {
        return 5; // 3 base + 2 bonus (Streak-Bonus)
    }
    return ATTENDANCE_POINTS_BASE; // 3 base
}

/**
 * Calculate streak bonus text
 * @param {number} streak - Current streak count
 * @returns {string} - Bonus text or empty string
 */
function getStreakBonusText(streak) {
    if (streak >= 5) {
        return ` (🔥 ${streak}x Streak!)`;
    } else if (streak >= 3) {
        return ` (⚡ ${streak}x Streak)`;
    }
    return '';
}

/**
 * Apply half-points for second training
 * @param {number} points - Original points
 * @returns {number} - Half points (rounded up)
 */
function applyHalfPoints(points) {
    return Math.ceil(points / 2);
}

/**
 * Determine if training is second or more on same day
 * @param {Array} attendanceRecords - All attendance records for this player
 * @param {string} currentDate - Current training date (YYYY-MM-DD)
 * @param {string} currentSessionId - Current session ID
 * @returns {boolean} - True if this is 2nd+ training today
 */
function isSecondTrainingToday(attendanceRecords, currentDate, currentSessionId) {
    const trainingsTodayCount = attendanceRecords.filter(record => {
        return record.date === currentDate && record.sessionId !== currentSessionId;
    }).length;

    return trainingsTodayCount > 0;
}

/**
 * Format date for display (DD.MM.YYYY)
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date
 */
function formatDateGerman(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/**
 * Calculate points for attendance
 * @param {number} streak - Current streak
 * @param {boolean} isSecondTraining - Is this 2nd+ training today?
 * @param {string} date - Date string
 * @param {string} subgroupName - Subgroup name
 * @returns {object} - { points, reason }
 */
function calculateAttendancePoints(streak, isSecondTraining, date, subgroupName) {
    let points = calculateStreakPoints(streak);
    const streakText = getStreakBonusText(streak);
    const formattedDate = formatDateGerman(date);

    let reason = `Training am ${formattedDate} - ${subgroupName}${streakText}`;

    if (isSecondTraining) {
        points = applyHalfPoints(points);
        reason += ` (2. Training heute)`;
    }

    return { points, reason };
}

// ============================================================================
// Tests: Points Calculation
// ============================================================================

describe('Attendance Points System', () => {
    describe('calculateStreakPoints()', () => {
        test('should return 3 points for streak 1 (base points)', () => {
            expect(calculateStreakPoints(1)).toBe(3);
        });

        test('should return 3 points for streak 2', () => {
            expect(calculateStreakPoints(2)).toBe(3);
        });

        test('should return 5 points for streak 3 (bonus starts)', () => {
            expect(calculateStreakPoints(3)).toBe(5);
        });

        test('should return 5 points for streak 4', () => {
            expect(calculateStreakPoints(4)).toBe(5);
        });

        test('should return 6 points for streak 5 (super-streak)', () => {
            expect(calculateStreakPoints(5)).toBe(6);
        });

        test('should return 6 points for streak 6', () => {
            expect(calculateStreakPoints(6)).toBe(6);
        });

        test('should return 6 points for very high streak (10)', () => {
            expect(calculateStreakPoints(10)).toBe(6);
        });

        test('should handle streak 0 (edge case)', () => {
            expect(calculateStreakPoints(0)).toBe(3);
        });
    });

    describe('getStreakBonusText()', () => {
        test('should return empty string for streak 1-2', () => {
            expect(getStreakBonusText(1)).toBe('');
            expect(getStreakBonusText(2)).toBe('');
        });

        test('should return streak bonus text for streak 3-4', () => {
            expect(getStreakBonusText(3)).toContain('⚡');
            expect(getStreakBonusText(3)).toContain('3x Streak');
            expect(getStreakBonusText(4)).toContain('4x Streak');
        });

        test('should return super-streak text for streak 5+', () => {
            expect(getStreakBonusText(5)).toContain('🔥');
            expect(getStreakBonusText(5)).toContain('5x Streak!');
            expect(getStreakBonusText(6)).toContain('6x Streak!');
        });
    });

    describe('applyHalfPoints()', () => {
        test('should return half of even numbers', () => {
            expect(applyHalfPoints(6)).toBe(3);
            expect(applyHalfPoints(4)).toBe(2);
            expect(applyHalfPoints(2)).toBe(1);
        });

        test('should round up for odd numbers', () => {
            expect(applyHalfPoints(3)).toBe(2); // 1.5 → 2
            expect(applyHalfPoints(5)).toBe(3); // 2.5 → 3
            expect(applyHalfPoints(1)).toBe(1); // 0.5 → 1
        });

        test('should handle edge case: 0 points', () => {
            expect(applyHalfPoints(0)).toBe(0);
        });
    });
});

// ============================================================================
// Tests: Second Training Detection
// ============================================================================

describe('Second Training Detection', () => {
    describe('isSecondTrainingToday()', () => {
        test('should return false when no other trainings on same day', () => {
            const attendanceRecords = [
                { date: '2025-01-01', sessionId: 'session-1' },
                { date: '2025-01-03', sessionId: 'session-2' },
            ];

            const result = isSecondTrainingToday(attendanceRecords, '2025-01-02', 'session-3');
            expect(result).toBe(false);
        });

        test('should return true when player attended another training today', () => {
            const attendanceRecords = [
                { date: '2025-01-02', sessionId: 'session-1' }, // First training today
                { date: '2025-01-03', sessionId: 'session-2' },
            ];

            const result = isSecondTrainingToday(attendanceRecords, '2025-01-02', 'session-3');
            expect(result).toBe(true);
        });

        test('should not count current session as "other" training', () => {
            const attendanceRecords = [
                { date: '2025-01-02', sessionId: 'session-1' }, // Current session
            ];

            const result = isSecondTrainingToday(attendanceRecords, '2025-01-02', 'session-1');
            expect(result).toBe(false); // Same session, not a second training
        });

        test('should return true when this is 3rd training of the day', () => {
            const attendanceRecords = [
                { date: '2025-01-02', sessionId: 'session-1' }, // First training
                { date: '2025-01-02', sessionId: 'session-2' }, // Second training
            ];

            const result = isSecondTrainingToday(attendanceRecords, '2025-01-02', 'session-3');
            expect(result).toBe(true);
        });

        test('should handle empty attendance records', () => {
            const result = isSecondTrainingToday([], '2025-01-02', 'session-1');
            expect(result).toBe(false);
        });

        test('should differentiate between different dates', () => {
            const attendanceRecords = [
                { date: '2025-01-01', sessionId: 'session-1' },
                { date: '2025-01-02', sessionId: 'session-2' },
                { date: '2025-01-03', sessionId: 'session-3' },
            ];

            // Training on Jan 4, no other trainings on Jan 4
            const result = isSecondTrainingToday(attendanceRecords, '2025-01-04', 'session-4');
            expect(result).toBe(false);
        });
    });
});

// ============================================================================
// Tests: Date Formatting
// ============================================================================

describe('Date Formatting', () => {
    describe('formatDateGerman()', () => {
        test('should format date as DD.MM.YYYY', () => {
            expect(formatDateGerman('2025-01-15')).toBe('15.01.2025');
            expect(formatDateGerman('2025-12-31')).toBe('31.12.2025');
            expect(formatDateGerman('2025-06-05')).toBe('05.06.2025');
        });

        test('should handle single-digit days and months', () => {
            expect(formatDateGerman('2025-01-01')).toBe('01.01.2025');
            expect(formatDateGerman('2025-09-09')).toBe('09.09.2025');
        });

        test('should handle leap year date', () => {
            expect(formatDateGerman('2024-02-29')).toBe('29.02.2024');
        });
    });
});

// ============================================================================
// Tests: Full Points Calculation Integration
// ============================================================================

describe('Full Attendance Points Calculation', () => {
    describe('calculateAttendancePoints()', () => {
        test('should calculate base points (streak 1, first training)', () => {
            const result = calculateAttendancePoints(1, false, '2025-01-15', 'Basistraining');

            expect(result.points).toBe(3);
            expect(result.reason).toBe('Training am 15.01.2025 - Basistraining');
        });

        test('should calculate streak bonus points (streak 3, first training)', () => {
            const result = calculateAttendancePoints(3, false, '2025-01-15', 'Basistraining');

            expect(result.points).toBe(5);
            expect(result.reason).toContain('Training am 15.01.2025 - Basistraining');
            expect(result.reason).toContain('⚡ 3x Streak');
        });

        test('should calculate super-streak bonus (streak 5, first training)', () => {
            const result = calculateAttendancePoints(5, false, '2025-01-15', 'Leistungstraining');

            expect(result.points).toBe(6);
            expect(result.reason).toContain('Training am 15.01.2025 - Leistungstraining');
            expect(result.reason).toContain('🔥 5x Streak!');
        });

        test('should apply half-points for second training (streak 1)', () => {
            const result = calculateAttendancePoints(1, true, '2025-01-15', 'Basistraining');

            expect(result.points).toBe(2); // 3 → 1.5 → 2 (rounded up)
            expect(result.reason).toContain('Training am 15.01.2025 - Basistraining');
            expect(result.reason).toContain('(2. Training heute)');
        });

        test('should apply half-points for second training (streak 3)', () => {
            const result = calculateAttendancePoints(3, true, '2025-01-15', 'Basistraining');

            expect(result.points).toBe(3); // 5 → 2.5 → 3 (rounded up)
            expect(result.reason).toContain('⚡ 3x Streak');
            expect(result.reason).toContain('(2. Training heute)');
        });

        test('should apply half-points for second training (streak 5)', () => {
            const result = calculateAttendancePoints(5, true, '2025-01-15', 'Leistungstraining');

            expect(result.points).toBe(3); // 6 → 3
            expect(result.reason).toContain('🔥 5x Streak!');
            expect(result.reason).toContain('(2. Training heute)');
        });

        test('should include date in reason text', () => {
            const result = calculateAttendancePoints(2, false, '2025-11-09', 'Techniktraining');

            expect(result.reason).toContain('09.11.2025');
            expect(result.reason).toContain('Techniktraining');
        });
    });
});

// ============================================================================
// Tests: Real-World Scenarios
// ============================================================================

describe('Real-World Attendance Scenarios', () => {
    test('Scenario 1: Player attends single training (streak 1)', () => {
        const attendanceRecords = [];
        const isSecond = isSecondTrainingToday(attendanceRecords, '2025-01-15', 'session-1');
        const result = calculateAttendancePoints(1, isSecond, '2025-01-15', 'Basistraining');

        expect(isSecond).toBe(false);
        expect(result.points).toBe(3);
        expect(result.reason).toBe('Training am 15.01.2025 - Basistraining');
    });

    test('Scenario 2: Player attends two trainings on same day (both streak 3)', () => {
        // First training
        const attendanceRecords1 = [];
        const isSecond1 = isSecondTrainingToday(attendanceRecords1, '2025-01-15', 'session-1');
        const result1 = calculateAttendancePoints(3, isSecond1, '2025-01-15', 'Basistraining');

        expect(isSecond1).toBe(false);
        expect(result1.points).toBe(5); // Full points
        expect(result1.reason).toContain('⚡ 3x Streak');
        expect(result1.reason).not.toContain('(2. Training heute)');

        // Second training (same day)
        const attendanceRecords2 = [
            { date: '2025-01-15', sessionId: 'session-1' }, // First training
        ];
        const isSecond2 = isSecondTrainingToday(attendanceRecords2, '2025-01-15', 'session-2');
        const result2 = calculateAttendancePoints(3, isSecond2, '2025-01-15', 'Leistungstraining');

        expect(isSecond2).toBe(true);
        expect(result2.points).toBe(3); // Half of 5 = 2.5 → 3
        expect(result2.reason).toContain('⚡ 3x Streak');
        expect(result2.reason).toContain('(2. Training heute)');
    });

    test('Scenario 3: Player builds streak over multiple days', () => {
        const scenarios = [
            { streak: 1, expectedPoints: 3 },
            { streak: 2, expectedPoints: 3 },
            { streak: 3, expectedPoints: 5 },
            { streak: 4, expectedPoints: 5 },
            { streak: 5, expectedPoints: 6 },
            { streak: 6, expectedPoints: 6 },
        ];

        scenarios.forEach(({ streak, expectedPoints }) => {
            const result = calculateAttendancePoints(streak, false, '2025-01-15', 'Basistraining');
            expect(result.points).toBe(expectedPoints);
        });
    });

    test('Scenario 4: Two trainings same day, one with streak 5', () => {
        // First training (streak 5 → 6 points)
        const attendanceRecords1 = [];
        const isSecond1 = isSecondTrainingToday(attendanceRecords1, '2025-01-20', 'session-A');
        const result1 = calculateAttendancePoints(5, isSecond1, '2025-01-20', 'Basistraining');

        expect(result1.points).toBe(6);
        expect(result1.reason).toContain('🔥 5x Streak!');

        // Second training (streak 5 → 6 points → 3 half-points)
        const attendanceRecords2 = [{ date: '2025-01-20', sessionId: 'session-A' }];
        const isSecond2 = isSecondTrainingToday(attendanceRecords2, '2025-01-20', 'session-B');
        const result2 = calculateAttendancePoints(5, isSecond2, '2025-01-20', 'Leistungstraining');

        expect(result2.points).toBe(3); // Half of 6
        expect(result2.reason).toContain('🔥 5x Streak!');
        expect(result2.reason).toContain('(2. Training heute)');
    });

    test('Scenario 5: Three trainings on same day', () => {
        // First training
        const result1 = calculateAttendancePoints(1, false, '2025-01-25', 'Training 1');
        expect(result1.points).toBe(3);

        // Second training
        const attendanceRecords2 = [{ date: '2025-01-25', sessionId: 'session-1' }];
        const isSecond2 = isSecondTrainingToday(attendanceRecords2, '2025-01-25', 'session-2');
        const result2 = calculateAttendancePoints(1, isSecond2, '2025-01-25', 'Training 2');
        expect(result2.points).toBe(2); // Half of 3 = 1.5 → 2

        // Third training
        const attendanceRecords3 = [
            { date: '2025-01-25', sessionId: 'session-1' },
            { date: '2025-01-25', sessionId: 'session-2' },
        ];
        const isSecond3 = isSecondTrainingToday(attendanceRecords3, '2025-01-25', 'session-3');
        const result3 = calculateAttendancePoints(1, isSecond3, '2025-01-25', 'Training 3');
        expect(result3.points).toBe(2); // Still half points (2nd+ training)
    });

    test('Scenario 6: Trainings on consecutive days (streak building)', () => {
        const attendanceDays = [
            { date: '2025-01-10', streak: 1, expectedPoints: 3 },
            { date: '2025-01-11', streak: 2, expectedPoints: 3 },
            { date: '2025-01-12', streak: 3, expectedPoints: 5 },
            { date: '2025-01-13', streak: 4, expectedPoints: 5 },
            { date: '2025-01-14', streak: 5, expectedPoints: 6 },
        ];

        attendanceDays.forEach(({ date, streak, expectedPoints }) => {
            const result = calculateAttendancePoints(streak, false, date, 'Basistraining');
            expect(result.points).toBe(expectedPoints);
            expect(result.reason).toContain(formatDateGerman(date));
        });
    });
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe('Edge Cases & Boundary Conditions', () => {
    test('should handle very long subgroup names', () => {
        const result = calculateAttendancePoints(
            3,
            false,
            '2025-01-15',
            'Sehr Langes Trainingsgruppen-Namen-Test-Beispiel'
        );

        expect(result.reason).toContain('Sehr Langes Trainingsgruppen-Namen-Test-Beispiel');
    });

    test('should handle special characters in subgroup name', () => {
        const result = calculateAttendancePoints(1, false, '2025-01-15', 'U18 & Erwachsene');
        expect(result.reason).toContain('U18 & Erwachsene');
    });

    test('should handle streak 100+ (unrealistic but valid)', () => {
        const result = calculateAttendancePoints(100, false, '2025-01-15', 'Basistraining');
        expect(result.points).toBe(6); // Still capped at 6
        expect(result.reason).toContain('🔥 100x Streak!');
    });

    test('should handle year boundary dates', () => {
        const result1 = calculateAttendancePoints(1, false, '2024-12-31', 'Basistraining');
        expect(result1.reason).toContain('31.12.2024');

        const result2 = calculateAttendancePoints(1, false, '2025-01-01', 'Basistraining');
        expect(result2.reason).toContain('01.01.2025');
    });

    test('should handle attendance records from multiple days correctly', () => {
        const attendanceRecords = [
            { date: '2025-01-10', sessionId: 'session-1' },
            { date: '2025-01-11', sessionId: 'session-2' },
            { date: '2025-01-12', sessionId: 'session-3' },
            { date: '2025-01-12', sessionId: 'session-4' }, // Second training on Jan 12
            { date: '2025-01-13', sessionId: 'session-5' },
        ];

        // New training on Jan 12 should be detected as 3rd training
        const isSecond = isSecondTrainingToday(attendanceRecords, '2025-01-12', 'session-6');
        expect(isSecond).toBe(true);

        // New training on Jan 14 should NOT be second training
        const isSecondJan14 = isSecondTrainingToday(attendanceRecords, '2025-01-14', 'session-7');
        expect(isSecondJan14).toBe(false);
    });
});

// ============================================================================
// Tests: Points History Reason Format
// ============================================================================

describe('Points History Reason Format', () => {
    test('should include all required elements for base training', () => {
        const result = calculateAttendancePoints(1, false, '2025-01-15', 'Basistraining');

        expect(result.reason).toMatch(/^Training am \d{2}\.\d{2}\.\d{4} - .+$/);
        expect(result.reason).toContain('Training am');
        expect(result.reason).toContain('15.01.2025');
        expect(result.reason).toContain('Basistraining');
    });

    test('should include streak bonus in reason when applicable', () => {
        const result3 = calculateAttendancePoints(3, false, '2025-01-15', 'Basistraining');
        expect(result3.reason).toContain('⚡ 3x Streak');

        const result5 = calculateAttendancePoints(5, false, '2025-01-15', 'Basistraining');
        expect(result5.reason).toContain('🔥 5x Streak!');
    });

    test('should append "(2. Training heute)" for second training', () => {
        const result = calculateAttendancePoints(1, true, '2025-01-15', 'Basistraining');
        expect(result.reason).toContain('(2. Training heute)');
        expect(result.reason).toMatch(/\(2\. Training heute\)$/);
    });

    test('should combine streak and second training markers', () => {
        const result = calculateAttendancePoints(5, true, '2025-01-15', 'Leistungstraining');

        expect(result.reason).toContain('Training am 15.01.2025 - Leistungstraining');
        expect(result.reason).toContain('🔥 5x Streak!');
        expect(result.reason).toContain('(2. Training heute)');
    });
});
