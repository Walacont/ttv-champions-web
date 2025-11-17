/**
 * Training Activities Constants and Utilities
 * Defines standard training activities and exercise management for sessions
 */

/**
 * Standard Training Activities
 * Diese Aktivitäten sind bei jedem Training verfügbar und haben feste Punktewerte
 */
export const STANDARD_ACTIVITIES = [
    {
        id: 'warmup',
        name: 'Aufwärmen',
        description: 'Allgemeines Aufwärmen und Stretching',
        points: 5,
        icon: '🏃',
        category: 'preparation'
    },
    {
        id: 'drills',
        name: 'Techniktraining',
        description: 'Grundlegende Technikübungen (Vorhand, Rückhand, etc.)',
        points: 8,
        icon: '🎯',
        category: 'technique'
    },
    {
        id: 'match_practice',
        name: 'Wettkampf-Training',
        description: 'Matches und wettkampfähnliche Situationen',
        points: 12,
        icon: '⚔️',
        category: 'match'
    },
    {
        id: 'fitness',
        name: 'Fitness & Kondition',
        description: 'Allgemeine Fitness- und Konditionsübungen',
        points: 8,
        icon: '💪',
        category: 'fitness'
    },
    {
        id: 'tactics',
        name: 'Taktik-Besprechung',
        description: 'Theoretische Besprechung von Taktiken und Strategien',
        points: 5,
        icon: '🧠',
        category: 'theory'
    },
    {
        id: 'cooldown',
        name: 'Cool-Down',
        description: 'Abwärmen und Dehnen nach dem Training',
        points: 3,
        icon: '🧘',
        category: 'cooldown'
    }
];

/**
 * Get activity by ID
 * @param {string} activityId - Activity ID
 * @returns {Object|null} Activity object or null
 */
export function getActivityById(activityId) {
    return STANDARD_ACTIVITIES.find(act => act.id === activityId) || null;
}

/**
 * Get total points for a list of activity IDs
 * @param {string[]} activityIds - Array of activity IDs
 * @returns {number} Total points
 */
export function calculateActivityPoints(activityIds) {
    return activityIds.reduce((total, id) => {
        const activity = getActivityById(id);
        return total + (activity ? activity.points : 0);
    }, 0);
}

/**
 * Validate planned activities structure
 * @param {Array} plannedActivities - Array of planned activities
 * @returns {boolean} True if valid
 */
export function validatePlannedActivities(plannedActivities) {
    if (!Array.isArray(plannedActivities)) return false;

    for (const activity of plannedActivities) {
        if (!activity.type || !activity.name) return false;

        if (activity.type === 'standard') {
            if (!activity.id || !activity.points) return false;
        } else if (activity.type === 'exercise') {
            if (!activity.exerciseId) return false;
        } else {
            return false; // Unknown type
        }
    }

    return true;
}

/**
 * Format planned activities for display
 * @param {Array} plannedActivities - Array of planned activities
 * @returns {string} Formatted string
 */
export function formatPlannedActivities(plannedActivities) {
    if (!plannedActivities || plannedActivities.length === 0) {
        return 'Keine Aktivitäten geplant';
    }

    return plannedActivities.map(act => {
        if (act.type === 'standard') {
            const activity = getActivityById(act.id);
            return activity ? `${activity.icon} ${activity.name}` : act.name;
        } else {
            return `📋 ${act.name}`;
        }
    }).join(', ');
}
