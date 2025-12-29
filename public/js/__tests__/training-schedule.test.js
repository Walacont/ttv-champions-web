/**
 * Unit Tests for Training Schedule Utilities
 *
 * Tests training schedule management functions:
 * - Time format validation (HH:MM)
 * - Date format validation (YYYY-MM-DD)
 * - Time range overlap detection
 * - Date range generation
 * - Date formatting
 * - Day of week naming
 */

import { describe, test, expect } from 'vitest';
import {
    isValidTimeFormat,
    isValidDateFormat,
    timeRangesOverlap,
    getDatesInRange,
    formatDate,
    getDayOfWeekName,
    formatTimeRange,
} from '../training-schedule-utils.js';

// ============================================================================
// TIME FORMAT VALIDATION
// ============================================================================

describe('Time Format Validation', () => {
    describe('isValidTimeFormat()', () => {
        describe('Valid Times', () => {
            test('should accept 00:00 (midnight)', () => {
                expect(isValidTimeFormat('00:00')).toBe(true);
            });

            test('should accept 23:59 (end of day)', () => {
                expect(isValidTimeFormat('23:59')).toBe(true);
            });

            test('should accept 09:30 (morning with leading zero)', () => {
                expect(isValidTimeFormat('09:30')).toBe(true);
            });

            test('should accept 12:00 (noon)', () => {
                expect(isValidTimeFormat('12:00')).toBe(true);
            });

            test('should accept 16:45 (typical training time)', () => {
                expect(isValidTimeFormat('16:45')).toBe(true);
            });

            test('should accept 19:00 (evening training)', () => {
                expect(isValidTimeFormat('19:00')).toBe(true);
            });

            test('should accept boundary hours correctly', () => {
                expect(isValidTimeFormat('00:00')).toBe(true);
                expect(isValidTimeFormat('01:00')).toBe(true);
                expect(isValidTimeFormat('09:00')).toBe(true);
                expect(isValidTimeFormat('10:00')).toBe(true);
                expect(isValidTimeFormat('19:00')).toBe(true);
                expect(isValidTimeFormat('20:00')).toBe(true);
                expect(isValidTimeFormat('23:00')).toBe(true);
            });

            test('should accept all valid minute values', () => {
                expect(isValidTimeFormat('12:00')).toBe(true);
                expect(isValidTimeFormat('12:15')).toBe(true);
                expect(isValidTimeFormat('12:30')).toBe(true);
                expect(isValidTimeFormat('12:45')).toBe(true);
                expect(isValidTimeFormat('12:59')).toBe(true);
            });
        });

        describe('Invalid Times - Format Errors', () => {
            test('should reject single digit hour (9:30)', () => {
                expect(isValidTimeFormat('9:30')).toBe(false);
            });

            test('should reject single digit minute (09:5)', () => {
                expect(isValidTimeFormat('09:5')).toBe(false);
            });

            test('should reject missing colon (0930)', () => {
                expect(isValidTimeFormat('0930')).toBe(false);
            });

            test('should reject wrong separator (09.30)', () => {
                expect(isValidTimeFormat('09.30')).toBe(false);
            });

            test('should reject extra characters (09:30:00)', () => {
                expect(isValidTimeFormat('09:30:00')).toBe(false);
            });

            test('should reject AM/PM format (09:30 AM)', () => {
                expect(isValidTimeFormat('09:30 AM')).toBe(false);
            });

            test('should reject empty string', () => {
                expect(isValidTimeFormat('')).toBe(false);
            });

            test('should reject null-like values', () => {
                expect(isValidTimeFormat(null)).toBe(false);
                expect(isValidTimeFormat(undefined)).toBe(false);
            });

            test('should reject non-string types', () => {
                expect(isValidTimeFormat(930)).toBe(false);
                expect(isValidTimeFormat(9.30)).toBe(false);
            });
        });

        describe('Invalid Times - Out of Range', () => {
            test('should reject hour 24 (24:00)', () => {
                expect(isValidTimeFormat('24:00')).toBe(false);
            });

            test('should reject hour 25 (25:00)', () => {
                expect(isValidTimeFormat('25:00')).toBe(false);
            });

            test('should reject minute 60 (12:60)', () => {
                expect(isValidTimeFormat('12:60')).toBe(false);
            });

            test('should reject minute 99 (12:99)', () => {
                expect(isValidTimeFormat('12:99')).toBe(false);
            });

            test('should reject negative-looking times (-1:00)', () => {
                expect(isValidTimeFormat('-1:00')).toBe(false);
            });
        });
    });
});

// ============================================================================
// DATE FORMAT VALIDATION
// ============================================================================

describe('Date Format Validation', () => {
    describe('isValidDateFormat()', () => {
        describe('Valid Dates', () => {
            test('should accept 2024-01-01 (new year)', () => {
                expect(isValidDateFormat('2024-01-01')).toBe(true);
            });

            test('should accept 2024-12-31 (end of year)', () => {
                expect(isValidDateFormat('2024-12-31')).toBe(true);
            });

            test('should accept 2024-02-29 (leap year)', () => {
                expect(isValidDateFormat('2024-02-29')).toBe(true);
            });

            test('should accept 2025-06-15 (mid year)', () => {
                expect(isValidDateFormat('2025-06-15')).toBe(true);
            });

            test('should accept various valid dates', () => {
                expect(isValidDateFormat('2020-01-01')).toBe(true);
                expect(isValidDateFormat('2030-12-31')).toBe(true);
                expect(isValidDateFormat('1999-05-20')).toBe(true);
            });
        });

        describe('Invalid Dates - Format Errors', () => {
            test('should reject DD-MM-YYYY format (31-12-2024)', () => {
                expect(isValidDateFormat('31-12-2024')).toBe(false);
            });

            test('should reject DD.MM.YYYY format (31.12.2024)', () => {
                expect(isValidDateFormat('31.12.2024')).toBe(false);
            });

            test('should reject MM/DD/YYYY format (12/31/2024)', () => {
                expect(isValidDateFormat('12/31/2024')).toBe(false);
            });

            test('should reject short year (24-01-01)', () => {
                expect(isValidDateFormat('24-01-01')).toBe(false);
            });

            test('should reject missing leading zeros (2024-1-1)', () => {
                expect(isValidDateFormat('2024-1-1')).toBe(false);
            });

            test('should reject no separators (20240101)', () => {
                expect(isValidDateFormat('20240101')).toBe(false);
            });

            test('should reject wrong separators (2024/01/01)', () => {
                expect(isValidDateFormat('2024/01/01')).toBe(false);
            });

            test('should reject empty string', () => {
                expect(isValidDateFormat('')).toBe(false);
            });

            test('should reject null-like values', () => {
                expect(isValidDateFormat(null)).toBe(false);
                expect(isValidDateFormat(undefined)).toBe(false);
            });

            test('should reject text dates (January 1, 2024)', () => {
                expect(isValidDateFormat('January 1, 2024')).toBe(false);
            });
        });

        describe('Edge Cases - Format Only (no semantic validation)', () => {
            // Note: isValidDateFormat only checks format, not if date actually exists
            test('should accept format even for non-existent dates (2024-02-30)', () => {
                // This is format-only validation - 02-30 matches pattern
                expect(isValidDateFormat('2024-02-30')).toBe(true);
            });

            test('should accept format for month 13 (format matches)', () => {
                expect(isValidDateFormat('2024-13-01')).toBe(true);
            });

            test('should accept format for day 32 (format matches)', () => {
                expect(isValidDateFormat('2024-01-32')).toBe(true);
            });
        });
    });
});

// ============================================================================
// TIME RANGE OVERLAP DETECTION
// ============================================================================

describe('Time Range Overlap Detection', () => {
    describe('timeRangesOverlap()', () => {
        describe('Overlapping Ranges', () => {
            test('should detect full overlap (same range)', () => {
                expect(timeRangesOverlap('16:00', '18:00', '16:00', '18:00')).toBe(true);
            });

            test('should detect partial overlap (start inside)', () => {
                // Range 1: 16:00-18:00
                // Range 2: 17:00-19:00
                expect(timeRangesOverlap('16:00', '18:00', '17:00', '19:00')).toBe(true);
            });

            test('should detect partial overlap (end inside)', () => {
                // Range 1: 17:00-19:00
                // Range 2: 16:00-18:00
                expect(timeRangesOverlap('17:00', '19:00', '16:00', '18:00')).toBe(true);
            });

            test('should detect containment (range 2 inside range 1)', () => {
                // Range 1: 16:00-20:00
                // Range 2: 17:00-19:00 (completely inside)
                expect(timeRangesOverlap('16:00', '20:00', '17:00', '19:00')).toBe(true);
            });

            test('should detect containment (range 1 inside range 2)', () => {
                // Range 1: 17:00-19:00
                // Range 2: 16:00-20:00 (contains range 1)
                expect(timeRangesOverlap('17:00', '19:00', '16:00', '20:00')).toBe(true);
            });

            test('should detect overlap with same start time', () => {
                expect(timeRangesOverlap('16:00', '18:00', '16:00', '17:00')).toBe(true);
            });

            test('should detect overlap with same end time', () => {
                expect(timeRangesOverlap('16:00', '18:00', '17:00', '18:00')).toBe(true);
            });
        });

        describe('Non-Overlapping Ranges', () => {
            test('should not detect overlap for completely separate ranges', () => {
                // Range 1: 10:00-12:00
                // Range 2: 14:00-16:00
                expect(timeRangesOverlap('10:00', '12:00', '14:00', '16:00')).toBe(false);
            });

            test('should not detect overlap for ranges in reverse order', () => {
                // Range 1: 14:00-16:00
                // Range 2: 10:00-12:00
                expect(timeRangesOverlap('14:00', '16:00', '10:00', '12:00')).toBe(false);
            });

            test('should not detect overlap for adjacent ranges (end = start)', () => {
                // Range 1: 16:00-18:00
                // Range 2: 18:00-20:00 (starts exactly when first ends)
                expect(timeRangesOverlap('16:00', '18:00', '18:00', '20:00')).toBe(false);
            });

            test('should not detect overlap for adjacent ranges (reverse)', () => {
                // Range 1: 18:00-20:00
                // Range 2: 16:00-18:00 (ends exactly when first starts)
                expect(timeRangesOverlap('18:00', '20:00', '16:00', '18:00')).toBe(false);
            });
        });

        describe('Real-World Training Scenarios', () => {
            test('should detect conflict: two trainings 16:00-18:00 and 17:00-19:00', () => {
                expect(timeRangesOverlap('16:00', '18:00', '17:00', '19:00')).toBe(true);
            });

            test('should allow: morning training 09:00-11:00 and afternoon 14:00-16:00', () => {
                expect(timeRangesOverlap('09:00', '11:00', '14:00', '16:00')).toBe(false);
            });

            test('should allow: back-to-back trainings 16:00-17:30 and 17:30-19:00', () => {
                expect(timeRangesOverlap('16:00', '17:30', '17:30', '19:00')).toBe(false);
            });

            test('should detect: overlapping evening trainings 18:00-20:00 and 19:00-21:00', () => {
                expect(timeRangesOverlap('18:00', '20:00', '19:00', '21:00')).toBe(true);
            });
        });

        describe('Edge Cases', () => {
            test('should handle midnight boundary (23:00-23:59 and 23:30-23:45)', () => {
                expect(timeRangesOverlap('23:00', '23:59', '23:30', '23:45')).toBe(true);
            });

            test('should handle very short ranges (1 minute)', () => {
                expect(timeRangesOverlap('16:00', '16:01', '16:00', '16:01')).toBe(true);
            });

            test('should handle different subgroups by overlap logic alone', () => {
                // Same time, same overlap - subgroup filtering is done elsewhere
                expect(timeRangesOverlap('16:00', '18:00', '16:00', '18:00')).toBe(true);
            });
        });
    });
});

// ============================================================================
// DATE RANGE GENERATION
// ============================================================================

describe('Date Range Generation', () => {
    describe('getDatesInRange()', () => {
        describe('Basic Functionality', () => {
            test('should return single date when start equals end', () => {
                const result = getDatesInRange('2024-06-15', '2024-06-15');
                expect(result).toEqual(['2024-06-15']);
            });

            test('should return two consecutive dates', () => {
                const result = getDatesInRange('2024-06-15', '2024-06-16');
                expect(result).toEqual(['2024-06-15', '2024-06-16']);
            });

            test('should return week of dates', () => {
                const result = getDatesInRange('2024-06-10', '2024-06-16');
                expect(result).toHaveLength(7);
                expect(result[0]).toBe('2024-06-10');
                expect(result[6]).toBe('2024-06-16');
            });

            test('should return correct number of dates for a month', () => {
                // June has 30 days
                const result = getDatesInRange('2024-06-01', '2024-06-30');
                expect(result).toHaveLength(30);
                expect(result[0]).toBe('2024-06-01');
                expect(result[29]).toBe('2024-06-30');
            });
        });

        describe('Month Boundary Crossing', () => {
            test('should handle month boundary (June to July)', () => {
                const result = getDatesInRange('2024-06-29', '2024-07-02');
                expect(result).toEqual([
                    '2024-06-29',
                    '2024-06-30',
                    '2024-07-01',
                    '2024-07-02',
                ]);
            });

            test('should handle year boundary (December to January)', () => {
                const result = getDatesInRange('2024-12-30', '2025-01-02');
                expect(result).toEqual([
                    '2024-12-30',
                    '2024-12-31',
                    '2025-01-01',
                    '2025-01-02',
                ]);
            });
        });

        describe('Leap Year Handling', () => {
            test('should handle leap year February (2024)', () => {
                const result = getDatesInRange('2024-02-28', '2024-03-01');
                expect(result).toEqual([
                    '2024-02-28',
                    '2024-02-29',
                    '2024-03-01',
                ]);
            });

            test('should handle non-leap year February (2023)', () => {
                const result = getDatesInRange('2023-02-27', '2023-03-01');
                expect(result).toEqual([
                    '2023-02-27',
                    '2023-02-28',
                    '2023-03-01',
                ]);
            });
        });

        describe('Format Consistency', () => {
            test('should always return dates in YYYY-MM-DD format', () => {
                const result = getDatesInRange('2024-01-01', '2024-01-05');
                result.forEach(date => {
                    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                });
            });

            test('should pad single digit months with zero', () => {
                const result = getDatesInRange('2024-01-01', '2024-01-01');
                expect(result[0]).toBe('2024-01-01');
            });

            test('should pad single digit days with zero', () => {
                const result = getDatesInRange('2024-06-05', '2024-06-05');
                expect(result[0]).toBe('2024-06-05');
            });
        });

        describe('Empty/Invalid Ranges', () => {
            test('should return empty array when end is before start', () => {
                const result = getDatesInRange('2024-06-20', '2024-06-15');
                expect(result).toEqual([]);
            });
        });
    });
});

// ============================================================================
// DATE FORMATTING
// ============================================================================

describe('Date Formatting', () => {
    describe('formatDate()', () => {
        test('should format Date object to YYYY-MM-DD', () => {
            const date = new Date(2024, 5, 15); // June 15, 2024 (month is 0-indexed)
            expect(formatDate(date)).toBe('2024-06-15');
        });

        test('should pad single-digit month with zero', () => {
            const date = new Date(2024, 0, 15); // January 15, 2024
            expect(formatDate(date)).toBe('2024-01-15');
        });

        test('should pad single-digit day with zero', () => {
            const date = new Date(2024, 5, 5); // June 5, 2024
            expect(formatDate(date)).toBe('2024-06-05');
        });

        test('should handle December correctly (month 11 -> 12)', () => {
            const date = new Date(2024, 11, 25); // December 25, 2024
            expect(formatDate(date)).toBe('2024-12-25');
        });

        test('should handle first day of year', () => {
            const date = new Date(2024, 0, 1); // January 1, 2024
            expect(formatDate(date)).toBe('2024-01-01');
        });

        test('should handle last day of year', () => {
            const date = new Date(2024, 11, 31); // December 31, 2024
            expect(formatDate(date)).toBe('2024-12-31');
        });

        test('should handle leap day', () => {
            const date = new Date(2024, 1, 29); // February 29, 2024
            expect(formatDate(date)).toBe('2024-02-29');
        });
    });
});

// ============================================================================
// DAY OF WEEK NAMING
// ============================================================================

describe('Day of Week Naming', () => {
    describe('getDayOfWeekName()', () => {
        test('should return Sonntag for 0', () => {
            expect(getDayOfWeekName(0)).toBe('Sonntag');
        });

        test('should return Montag for 1', () => {
            expect(getDayOfWeekName(1)).toBe('Montag');
        });

        test('should return Dienstag for 2', () => {
            expect(getDayOfWeekName(2)).toBe('Dienstag');
        });

        test('should return Mittwoch for 3', () => {
            expect(getDayOfWeekName(3)).toBe('Mittwoch');
        });

        test('should return Donnerstag for 4', () => {
            expect(getDayOfWeekName(4)).toBe('Donnerstag');
        });

        test('should return Freitag for 5', () => {
            expect(getDayOfWeekName(5)).toBe('Freitag');
        });

        test('should return Samstag for 6', () => {
            expect(getDayOfWeekName(6)).toBe('Samstag');
        });

        test('should return undefined for invalid day numbers', () => {
            expect(getDayOfWeekName(7)).toBeUndefined();
            expect(getDayOfWeekName(-1)).toBeUndefined();
            expect(getDayOfWeekName(10)).toBeUndefined();
        });
    });
});

// ============================================================================
// TIME RANGE FORMATTING
// ============================================================================

describe('Time Range Formatting', () => {
    describe('formatTimeRange()', () => {
        test('should format typical training time range', () => {
            expect(formatTimeRange('16:00', '18:00')).toBe('16:00-18:00');
        });

        test('should format morning training', () => {
            expect(formatTimeRange('09:00', '11:00')).toBe('09:00-11:00');
        });

        test('should format evening training', () => {
            expect(formatTimeRange('19:00', '21:00')).toBe('19:00-21:00');
        });

        test('should format short training (1 hour)', () => {
            expect(formatTimeRange('17:00', '18:00')).toBe('17:00-18:00');
        });

        test('should format with non-standard times', () => {
            expect(formatTimeRange('16:30', '17:45')).toBe('16:30-17:45');
        });
    });
});

// ============================================================================
// INTEGRATION SCENARIOS
// ============================================================================

describe('Integration Scenarios', () => {
    describe('Training Scheduling Workflow', () => {
        test('should validate times before checking overlap', () => {
            const startTime = '16:00';
            const endTime = '18:00';

            // Step 1: Validate format
            expect(isValidTimeFormat(startTime)).toBe(true);
            expect(isValidTimeFormat(endTime)).toBe(true);

            // Step 2: Check for conflicts with existing training
            const existingStart = '17:00';
            const existingEnd = '19:00';

            // Step 3: Detect overlap
            const hasConflict = timeRangesOverlap(startTime, endTime, existingStart, existingEnd);
            expect(hasConflict).toBe(true);
        });

        test('should generate week of sessions and format them', () => {
            const dates = getDatesInRange('2024-06-10', '2024-06-16');

            // Should have 7 days
            expect(dates).toHaveLength(7);

            // Each date should be valid format
            dates.forEach(date => {
                expect(isValidDateFormat(date)).toBe(true);
            });
        });

        test('should detect Monday training from date', () => {
            // June 10, 2024 is a Monday
            const date = new Date('2024-06-10T12:00:00');
            const dayOfWeek = date.getDay();
            expect(getDayOfWeekName(dayOfWeek)).toBe('Montag');
        });

        test('should allow back-to-back trainings for different subgroups', () => {
            // First training ends exactly when second starts
            const training1End = '17:30';
            const training2Start = '17:30';

            // Same time slot check (overlap logic only - subgroup filtering is separate)
            expect(timeRangesOverlap('16:00', training1End, training2Start, '19:00')).toBe(false);
        });
    });

    describe('Template Date Filtering', () => {
        test('should check template validity for specific date', () => {
            const templateStartDate = '2024-06-01';
            const templateEndDate = '2024-08-31';
            const checkDate = '2024-07-15';

            // Simulate template date boundary check
            const isWithinRange = checkDate >= templateStartDate && checkDate <= templateEndDate;
            expect(isWithinRange).toBe(true);
        });

        test('should reject date before template starts', () => {
            const templateStartDate = '2024-06-01';
            const checkDate = '2024-05-15';

            expect(checkDate < templateStartDate).toBe(true);
        });

        test('should reject date after template ends', () => {
            const templateEndDate = '2024-08-31';
            const checkDate = '2024-09-15';

            expect(checkDate > templateEndDate).toBe(true);
        });
    });
});
