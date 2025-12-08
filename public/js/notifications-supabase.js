// Notifications Module - Supabase Version
// Handles in-app notifications for points, matches, etc.

import { getSupabase } from './supabase-init.js';

let notificationSubscription = null;
let notificationModalOpen = false;

/**
 * Initialize notifications system
 * @param {string} userId - Current user's ID
 */
export async function initNotifications(userId) {
    const db = getSupabase();
    if (!db || !userId) return;

    // Setup notification bell click handlers FIRST (before async operations)
    setupNotificationHandlers(userId);

    // Load initial notification count (non-blocking)
    try {
        await updateNotificationBadge(userId);

        // Subscribe to real-time notifications
        notificationSubscription = db
            .channel(`notifications-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, () => {
                updateNotificationBadge(userId);
            })
            .subscribe();
    } catch (e) {
        console.warn('Could not load notifications:', e);
    }
}

/**
 * Update the notification badge count
 */
async function updateNotificationBadge(userId) {
    const db = getSupabase();
    if (!db) return;

    const { count, error } = await db
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('Error fetching notification count:', error);
        return;
    }

    const unreadCount = count || 0;

    // Update desktop badge
    const desktopBadge = document.getElementById('desktop-notifications-badge');
    if (desktopBadge) {
        if (unreadCount > 0) {
            desktopBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            desktopBadge.classList.remove('hidden');
        } else {
            desktopBadge.classList.add('hidden');
        }
    }

    // Update mobile badge
    const mobileBadge = document.getElementById('mobile-notifications-badge');
    if (mobileBadge) {
        if (unreadCount > 0) {
            mobileBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            mobileBadge.style.display = 'flex';
        } else {
            mobileBadge.style.display = 'none';
        }
    }
}

/**
 * Setup click handlers for notification bells
 */
function setupNotificationHandlers(userId) {
    const desktopBtn = document.getElementById('desktop-notifications-btn');
    const mobileBtn = document.getElementById('mobile-notifications-btn');

    const handler = () => showNotificationModal(userId);

    if (desktopBtn) {
        desktopBtn.addEventListener('click', handler);
    }
    if (mobileBtn) {
        mobileBtn.addEventListener('click', handler);
    }
}

/**
 * Show the notification modal/dropdown
 */
async function showNotificationModal(userId) {
    if (notificationModalOpen) return;
    notificationModalOpen = true;

    const db = getSupabase();
    if (!db) return;

    // Fetch recent notifications
    const { data: notifications, error } = await db
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching notifications:', error);
        notificationModalOpen = false;
        return;
    }

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-16 sm:pt-20';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="text-lg font-semibold text-gray-900">Benachrichtigungen</h3>
                <button id="close-notification-modal" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto">
                ${notifications && notifications.length > 0 ? `
                    <ul class="divide-y divide-gray-200">
                        ${notifications.map(n => `
                            <li class="p-4 ${n.is_read ? 'bg-white' : 'bg-blue-50'} hover:bg-gray-50 notification-item" data-id="${n.id}" data-read="${n.is_read}">
                                <div class="flex items-start gap-3">
                                    <div class="flex-shrink-0 mt-1">
                                        ${getNotificationIcon(n.type)}
                                    </div>
                                    <div class="flex-1 min-w-0 cursor-pointer notification-content">
                                        <p class="text-sm font-medium text-gray-900">${escapeHtml(n.title)}</p>
                                        <p class="text-sm text-gray-600 mt-0.5">${escapeHtml(n.message)}</p>
                                        <p class="text-xs text-gray-400 mt-1">${formatTimeAgo(n.created_at)}</p>
                                    </div>
                                    <div class="flex items-center gap-2 flex-shrink-0">
                                        ${!n.is_read ? '<span class="unread-dot w-2 h-2 bg-blue-500 rounded-full"></span>' : ''}
                                        ${n.is_read ? `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>` : ''}
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="p-8 text-center text-gray-500">
                        <i class="far fa-bell-slash text-4xl mb-3"></i>
                        <p>Keine Benachrichtigungen</p>
                    </div>
                `}
            </div>
            ${notifications && notifications.length > 0 ? `
                <div class="p-3 border-t flex gap-2">
                    <button id="mark-all-read" class="flex-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium py-2">
                        Alle gelesen
                    </button>
                    <button id="delete-all-read" class="flex-1 text-sm text-red-500 hover:text-red-700 font-medium py-2">
                        Gelesene löschen
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
        modal.remove();
        notificationModalOpen = false;
    };

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.getElementById('close-notification-modal')?.addEventListener('click', closeModal);

    // Mark as read on click (on content, not delete button)
    modal.querySelectorAll('.notification-content').forEach(content => {
        content.addEventListener('click', async () => {
            const item = content.closest('.notification-item');
            const notificationId = item.dataset.id;
            await markNotificationAsRead(notificationId);
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            // Add delete button after marking as read
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
            updateNotificationBadge(userId);
        });
    });

    // Delete single notification
    modal.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-notification');
        if (deleteBtn) {
            e.stopPropagation();
            const item = deleteBtn.closest('.notification-item');
            const notificationId = item.dataset.id;
            await deleteNotification(notificationId);
            item.remove();
            updateNotificationBadge(userId);
            // Check if no notifications left
            const remainingItems = modal.querySelectorAll('.notification-item');
            if (remainingItems.length === 0) {
                modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
                    <div class="p-8 text-center text-gray-500">
                        <i class="far fa-bell-slash text-4xl mb-3"></i>
                        <p>Keine Benachrichtigungen</p>
                    </div>
                `;
                modal.querySelector('.p-3.border-t')?.remove();
            }
        }
    });

    // Mark all as read
    document.getElementById('mark-all-read')?.addEventListener('click', async () => {
        await markAllNotificationsAsRead(userId);
        modal.querySelectorAll('.notification-item').forEach(item => {
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            // Add delete button
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
        });
        updateNotificationBadge(userId);
    });

    // Delete all read notifications
    document.getElementById('delete-all-read')?.addEventListener('click', async () => {
        await deleteAllReadNotifications(userId);
        modal.querySelectorAll('.notification-item[data-read="true"]').forEach(item => {
            item.remove();
        });
        updateNotificationBadge(userId);
        // Check if no notifications left
        const remainingItems = modal.querySelectorAll('.notification-item');
        if (remainingItems.length === 0) {
            modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="far fa-bell-slash text-4xl mb-3"></i>
                    <p>Keine Benachrichtigungen</p>
                </div>
            `;
            modal.querySelector('.p-3.border-t')?.remove();
        }
    });
}

/**
 * Mark a single notification as read
 */
async function markNotificationAsRead(notificationId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsAsRead(userId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
}

/**
 * Delete a single notification
 */
async function deleteNotification(notificationId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .delete()
        .eq('id', notificationId);
}

/**
 * Delete all read notifications for a user
 */
async function deleteAllReadNotifications(userId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('is_read', true);
}

/**
 * Create a notification for a user
 */
export async function createNotification(userId, type, title, message, data = {}) {
    const db = getSupabase();
    if (!db) return;

    const { error } = await db
        .from('notifications')
        .insert({
            user_id: userId,
            type,
            title,
            message,
            data
        });

    if (error) {
        console.error('Error creating notification:', error);
    }
}

/**
 * Create a points notification
 */
export async function createPointsNotification(userId, points, xp, eloChange, reason, awardedBy) {
    const isPositive = points >= 0;
    const type = isPositive ? 'points_awarded' : 'points_deducted';
    const title = isPositive ? 'Punkte erhalten!' : 'Punkte abgezogen';

    let message = `${isPositive ? '+' : ''}${points} Saisonpunkte`;
    if (xp !== undefined && xp !== points) {
        message += `, ${xp >= 0 ? '+' : ''}${xp} XP`;
    }
    if (eloChange && eloChange !== 0) {
        message += `, ${eloChange >= 0 ? '+' : ''}${eloChange} Elo`;
    }
    message += ` - ${reason}`;
    if (awardedBy) {
        message += ` (von ${awardedBy})`;
    }

    await createNotification(userId, type, title, message, {
        points,
        xp,
        elo_change: eloChange,
        reason,
        awarded_by: awardedBy
    });
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type) {
    const icons = {
        'points_awarded': '<i class="fas fa-plus-circle text-green-500 text-lg"></i>',
        'points_deducted': '<i class="fas fa-minus-circle text-red-500 text-lg"></i>',
        'match_request': '<i class="fas fa-table-tennis-paddle-ball text-indigo-500 text-lg"></i>',
        'match_approved': '<i class="fas fa-check-circle text-green-500 text-lg"></i>',
        'challenge_completed': '<i class="fas fa-trophy text-yellow-500 text-lg"></i>',
        'default': '<i class="fas fa-bell text-gray-500 text-lg"></i>'
    };
    return icons[type] || icons.default;
}

/**
 * Format time ago
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    return date.toLocaleDateString('de-DE');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Cleanup subscriptions
 */
export function cleanupNotifications() {
    if (notificationSubscription) {
        notificationSubscription.unsubscribe();
        notificationSubscription = null;
    }
}
