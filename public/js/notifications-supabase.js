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
                            <li class="p-4 ${n.is_read ? 'bg-white' : 'bg-blue-50'} hover:bg-gray-50 notification-item" data-id="${n.id}" data-read="${n.is_read}" data-type="${n.type}">
                                <div class="flex items-start gap-3">
                                    <div class="flex-shrink-0 mt-1">
                                        ${getNotificationIcon(n.type)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="cursor-pointer notification-content">
                                            <p class="text-sm font-medium text-gray-900">${escapeHtml(n.title)}</p>
                                            <p class="text-sm text-gray-600 mt-0.5">${escapeHtml(n.message)}</p>
                                            <p class="text-xs text-gray-400 mt-1">${formatTimeAgo(n.created_at)}</p>
                                        </div>
                                        ${renderFollowRequestActions(n)}
                                    </div>
                                    <div class="flex items-center gap-2 flex-shrink-0">
                                        ${!n.is_read && !isFollowRequest(n.type) ? '<span class="unread-dot w-2 h-2 bg-blue-500 rounded-full"></span>' : ''}
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
    modal.querySelectorAll('.notification-content').forEach((content, index) => {
        content.addEventListener('click', async () => {
            const item = content.closest('.notification-item');
            const notificationId = item.dataset.id;
            const notification = notifications[index];

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

            // Handle navigation based on notification type
            handleNotificationClick(notification);
            closeModal();
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
            checkEmptyNotifications(modal);
        }
    });

    // Accept follow request
    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-follow-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requesterId = acceptBtn.dataset.requesterId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            // Disable buttons while processing
            const actionsDiv = item.querySelector('.follow-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptFollow(requesterId, notificationId, userId);
            if (success) {
                // Update UI to show accepted
                item.classList.remove('bg-blue-50');
                item.classList.add('bg-white');
                item.dataset.read = 'true';
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span class="text-sm text-green-600"><i class="fas fa-check mr-1"></i>Angenommen</span>';
                }
                updateNotificationBadge(userId);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span class="text-sm text-red-500">Fehler - bitte erneut versuchen</span>';
                }
            }
        }
    });

    // Decline follow request
    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-follow-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requesterId = declineBtn.dataset.requesterId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            // Disable buttons while processing
            const actionsDiv = item.querySelector('.follow-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleDeclineFollow(requesterId, notificationId, userId);
            if (success) {
                item.remove();
                updateNotificationBadge(userId);
                checkEmptyNotifications(modal);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span class="text-sm text-red-500">Fehler - bitte erneut versuchen</span>';
                }
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
 * Create a follow request notification
 */
export async function createFollowRequestNotification(toUserId, fromUserId, fromUserName) {
    const title = 'Neue Follow-Anfrage';
    const message = `${fromUserName} möchte dir folgen`;

    await createNotification(toUserId, 'follow_request', title, message, {
        requester_id: fromUserId,
        requester_name: fromUserName
    });
}

/**
 * Create a follow accepted notification
 */
export async function createFollowAcceptedNotification(toUserId, accepterId, accepterName) {
    const title = 'Follow-Anfrage angenommen';
    const message = `${accepterName} folgt dir jetzt`;

    await createNotification(toUserId, 'follow_accepted', title, message, {
        accepter_id: accepterId,
        accepter_name: accepterName
    });
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
 * Check if notifications list is empty and update UI
 */
function checkEmptyNotifications(modal) {
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

/**
 * Handle notification click - navigate based on type
 */
function handleNotificationClick(notification) {
    if (!notification) return;

    const type = notification.type;

    // Follow request notifications - navigate to profile or community
    if (type === 'follow_request' || type === 'friend_request') {
        const requesterId = notification.data?.requester_id;
        if (requesterId) {
            window.location.href = `/profile.html?id=${requesterId}`;
            return;
        }
    }

    // Friend request accepted - navigate to their profile
    if (type === 'friend_request_accepted' || type === 'follow_accepted') {
        const accepterId = notification.data?.accepter_id;
        if (accepterId) {
            window.location.href = `/profile.html?id=${accepterId}`;
            return;
        }
        // Fallback to community tab
        const communityTab = document.querySelector('[data-tab="community"]');
        if (communityTab) {
            communityTab.click();
        }
    }
    // Add more navigation handlers for other notification types here
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
        'follow_request': '<i class="fas fa-user-plus text-blue-500 text-lg"></i>',
        'friend_request': '<i class="fas fa-user-plus text-blue-500 text-lg"></i>',
        'friend_request_accepted': '<i class="fas fa-user-check text-green-500 text-lg"></i>',
        'follow_accepted': '<i class="fas fa-user-check text-green-500 text-lg"></i>',
        'default': '<i class="fas fa-bell text-gray-500 text-lg"></i>'
    };
    return icons[type] || icons.default;
}

/**
 * Check if notification type is an actionable follow request
 */
function isFollowRequest(type) {
    return type === 'follow_request' || type === 'friend_request';
}

/**
 * Render action buttons for follow request notifications
 */
function renderFollowRequestActions(notification) {
    if (!isFollowRequest(notification.type) || notification.is_read) {
        return '';
    }

    const requesterId = notification.data?.requester_id;
    if (!requesterId) return '';

    return `
        <div class="follow-request-actions flex gap-2 mt-2">
            <button class="accept-follow-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
                    data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                <i class="fas fa-check mr-1"></i>Annehmen
            </button>
            <button class="decline-follow-btn bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full transition"
                    data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                <i class="fas fa-times mr-1"></i>Ablehnen
            </button>
        </div>
    `;
}

/**
 * Handle accept follow request from notification
 */
async function handleAcceptFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the friendship
        const { data: friendship } = await db
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('Friendship not found');
            return false;
        }

        // Get current user's name for notification
        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Jemand';

        const { error } = await db.rpc('accept_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        // Mark notification as read
        await markNotificationAsRead(notificationId);

        // Notify the requester that their request was accepted
        await createFollowAcceptedNotification(requesterId, userId, currentUserName);

        return true;
    } catch (error) {
        console.error('Error accepting follow request:', error);
        return false;
    }
}

/**
 * Handle decline follow request from notification
 */
async function handleDeclineFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the friendship
        const { data: friendship } = await db
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('Friendship not found');
            // Still delete the notification since the friendship might have been handled
            await deleteNotification(notificationId);
            return true;
        }

        const { error } = await db.rpc('decline_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        // Delete the notification
        await deleteNotification(notificationId);

        return true;
    } catch (error) {
        console.error('Error declining follow request:', error);
        return false;
    }
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
